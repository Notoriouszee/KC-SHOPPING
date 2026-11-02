"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "../auth/session";
import { normalisePhone } from "../domain/validation";
import { parseNairaToKobo } from "../domain/money";
import { changeShopSlug, getShopProfile, updateShopProfile } from "../repositories/shop";
import { deleteStoredImage, saveImage } from "../storage";
import { failure, formText, type ActionState } from "./types";

function descriptionProblem(value: string): string | null {
  if (value.length > 600) return "Keep your description under 600 characters.";
  return null;
}

export async function updateShopAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const shopName = formText(formData, "shopName");
  const description = formText(formData, "shopDescription");
  const contactPhoneRaw = formText(formData, "shopContactPhone");
  const removeLogo = formText(formData, "removeLogo") === "1";
  const bankName = formText(formData, "bankName");
  const accountName = formText(formData, "accountName");
  const accountNumber = formText(formData, "accountNumber");
  const deliveryFeeRaw = formText(formData, "deliveryFee");
  const deliveryNote = formText(formData, "deliveryNote");

  const fieldErrors: Record<string, string> = {};

  if (shopName.length < 2) fieldErrors.shopName = "Enter your shop name.";
  if (shopName.length > 80) fieldErrors.shopName = "Keep your shop name under 80 characters.";

  const descriptionIssue = descriptionProblem(description);
  if (descriptionIssue) fieldErrors.shopDescription = descriptionIssue;

  let contactPhone: string | null = null;
  if (contactPhoneRaw) {
    contactPhone = normalisePhone(contactPhoneRaw);
    if (!contactPhone) {
      fieldErrors.shopContactPhone =
        "Enter a valid phone number, for example 0803 123 4567.";
    }
  }

  const deliveryFeeKobo = parseNairaToKobo(deliveryFeeRaw || "0");
  if (deliveryFeeKobo === null) {
    fieldErrors.deliveryFee = "Enter a valid delivery fee, or 0.";
  }

  const digitsOnly = accountNumber.replace(/\s/g, "");
  if (digitsOnly && !/^\d{6,20}$/.test(digitsOnly)) {
    fieldErrors.accountNumber = "Account numbers are 6 to 20 digits.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const current = getShopProfile(user.id);
  if (!current) return { error: "We could not find your shop." };

  let logoUrl = current.shop_logo_url;

  const upload = formData.get("shopLogo");
  const hasUpload = upload instanceof File && upload.size > 0;

  if (hasUpload) {
    const saved = await saveImage(upload as File, {
      folder: "shop-logos",
      ownerId: user.id,
    });
    if ("error" in saved) {
      return { error: saved.error, fieldErrors: { shopLogo: saved.error } };
    }
    // Only remove the previous file once the replacement is safely stored.
    await deleteStoredImage(current.shop_logo_url);
    logoUrl = saved.url;
  } else if (removeLogo) {
    await deleteStoredImage(current.shop_logo_url);
    logoUrl = null;
  }

  try {
    updateShopProfile(user.id, {
      shopName,
      description,
      logoUrl,
      contactPhone,
      bankName,
      accountName,
      accountNumber: digitsOnly || null,
      deliveryFeeKobo: deliveryFeeKobo ?? 0,
      deliveryNote,
    });
  } catch (error) {
    return failure(error, "We could not save your shop details.");
  }

  revalidatePath("/my-shop");
  if (current.shop_slug) revalidatePath(`/shop/${current.shop_slug}`);
  return { ok: true, message: "Shop details saved." };
}

export async function changeShopSlugAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const requested = formText(formData, "slug");
  const confirmed = formText(formData, "confirmChange");

  if (confirmed !== "yes") {
    return {
      error: "Confirm that you understand old links will redirect.",
      fieldErrors: { confirmChange: "Tick the box to continue." },
    };
  }

  const current = getShopProfile(user.id);
  if (!current) return { error: "We could not find your shop." };

  try {
    const result = changeShopSlug(user.id, requested);

    revalidatePath("/my-shop");
    if (result.previousSlug) revalidatePath(`/shop/${result.previousSlug}`);
    revalidatePath(`/shop/${result.slug}`);

    return {
      ok: true,
      message: result.previousSlug
        ? `Shop link changed to /shop/${result.slug}. Your old link now redirects here.`
        : `Shop link set to /shop/${result.slug}.`,
    };
  } catch (error) {
    return failure(error, "We could not change your shop link.");
  }
}
