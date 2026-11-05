"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth/session";
import { subscriptionState } from "../repositories/subscriptions";
import { parseNairaToKobo } from "../domain/money";
import { isAvailability, isPublicationStatus } from "../domain/status";
import { ValidationError } from "../domain/validation";
import {
  MAX_PRODUCT_IMAGES,
  addImage,
  createProduct,
  deleteProduct,
  getProduct,
  removeImage,
  setAvailability,
  setCoverImage,
  setPublication,
  updateProduct,
} from "../repositories/products";
import { getShopProfile } from "../repositories/shop";
import { deleteStoredImage, saveImage } from "../storage";
import { failure, formFiles, formList, formText, isRedirectError, type ActionState } from "./types";

const IMAGE_FOLDER = "product-images";

function revalidateProductSurfaces(shopSlug: string | null, productId?: string): void {
  revalidatePath("/products");
  if (productId) revalidatePath(`/products/${productId}`);
  revalidatePath("/dashboard");
  if (shopSlug) {
    revalidatePath(`/shop/${shopSlug}`);
    revalidatePath(`/product/${shopSlug}`, "layout");
  }
}

export async function saveProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  // A lapsed seller keeps a readable dashboard, but cannot change the catalogue.
  const subscription = await subscriptionState(user.id);
  if (!subscription.active) {
    return {
      error: "Your free month has ended. Subscribe on the Billing page to add or edit products.",
    };
  }

  const productId = formText(formData, "productId");
  const isEdit = productId !== "";

  const fieldErrors: Record<string, string> = {};

  const name = formText(formData, "name");
  if (name.length < 2) fieldErrors.name = "Enter a product name.";
  if (name.length > 120) fieldErrors.name = "Keep the name under 120 characters.";

  const priceKobo = parseNairaToKobo(formText(formData, "price"));
  if (priceKobo === null) {
    fieldErrors.price = "Enter a price, for example 12500.";
  } else if (priceKobo <= 0) {
    fieldErrors.price = "Price must be more than ₦0.";
  }

  const description = formText(formData, "description");
  if (description.length > 2000) fieldErrors.description = "Keep the description under 2000 characters.";

  const availabilityRaw = formText(formData, "availability") || "available";
  if (!isAvailability(availabilityRaw)) fieldErrors.availability = "Choose an availability.";

  const publicationRaw = formText(formData, "publicationStatus") || "draft";
  if (!isPublicationStatus(publicationRaw)) {
    fieldErrors.publicationStatus = "Choose whether to publish this product.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const shop = await getShopProfile(user.id);

  // Check the photo budget before writing anything, so a rejected upload cannot
  // leave the product half-saved.
  const existing = isEdit ? await getProduct(user.id, productId) : null;
  if (isEdit && !existing) {
    return { error: "That product no longer exists." };
  }
  const removals = formList(formData, "removeImage").filter(Boolean);
  const uploads = formFiles(formData, "images");
  const keptCount = (existing?.images.length ?? 0) - removals.length;
  const allowedUploads = MAX_PRODUCT_IMAGES - Math.max(keptCount, 0);

  if (uploads.length > allowedUploads) {
    return {
      error: `You can have up to ${MAX_PRODUCT_IMAGES} photos per product. Remove some before adding more.`,
      fieldErrors: { images: `You can add ${Math.max(allowedUploads, 0)} more photo(s).` },
    };
  }

  try {
    const product = isEdit
      ? await updateProduct(user.id, productId, {
          name,
          priceKobo: priceKobo as number,
          description,
          availability: availabilityRaw as "available" | "out_of_stock",
          publicationStatus: publicationRaw as "draft" | "published",
        })
      : await createProduct(user.id, {
          name,
          priceKobo: priceKobo as number,
          description,
          availability: availabilityRaw as "available" | "out_of_stock",
          publicationStatus: publicationRaw as "draft" | "published",
        });

    // Remove photos the seller unticked.
    for (const imageId of removals) {
      const removed = await removeImage(user.id, imageId);
      await deleteStoredImage(removed.url);
    }

    for (const file of uploads) {
      const saved = await saveImage(file, { folder: IMAGE_FOLDER, ownerId: user.id });
      if ("error" in saved) {
        return { error: saved.error, fieldErrors: { images: saved.error } };
      }
      await addImage(user.id, product.id, {
        url: saved.url,
        alt: product.name,
        width: saved.width,
        height: saved.height,
      });
    }

    // Optional explicit cover choice.
    const coverId = formText(formData, "coverImage");
    const refreshed = await getProduct(user.id, product.id);
    if (coverId && refreshed?.images.some((image) => image.id === coverId)) {
      await setCoverImage(user.id, product.id, coverId);
    }

    if (shop?.shop_slug) {
      revalidatePath(`/product/${shop.shop_slug}/${product.slug}`);
    }

    const finalProduct = await getProduct(user.id, product.id);
    revalidateProductSurfaces(shop?.shop_slug ?? null, product.id);

    if (!isEdit) {
      redirect(`/products/${finalProduct?.id ?? product.id}?created=1`);
    }

    return {
      ok: true,
      message:
        finalProduct?.publication_status === "published"
          ? "Product saved and published."
          : "Product saved as a draft.",
    };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return failure(error, "We could not save that product.");
  }
}

export async function togglePublicationAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const productId = formText(formData, "productId");
  const next = formText(formData, "publicationStatus");
  if (!productId || !isPublicationStatus(next)) return;

  try {
    await setPublication(user.id, productId, next);
  } catch (error) {
    console.error("[product publish]", error);
  }

  const shop = await getShopProfile(user.id);
  revalidateProductSurfaces(shop?.shop_slug ?? null, productId);
}

export async function toggleAvailabilityAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const productId = formText(formData, "productId");
  const next = formText(formData, "availability");
  if (!productId || !isAvailability(next)) return;

  try {
    await setAvailability(user.id, productId, next);
  } catch (error) {
    console.error("[product availability]", error);
  }

  const shop = await getShopProfile(user.id);
  revalidateProductSurfaces(shop?.shop_slug ?? null, productId);
}

export async function setCoverImageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const productId = formText(formData, "productId");
  const imageId = formText(formData, "imageId");
  if (!productId || !imageId) return;

  try {
    await setCoverImage(user.id, productId, imageId);
  } catch (error) {
    console.error("[product cover]", error);
  }

  const shop = await getShopProfile(user.id);
  revalidateProductSurfaces(shop?.shop_slug ?? null, productId);
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const productId = formText(formData, "productId");
  if (!productId) return;

  let urls: string[] = [];
  try {
    urls = await deleteProduct(user.id, productId);
  } catch (error) {
    if (!(error instanceof ValidationError)) console.error("[product delete]", error);
  }

  for (const url of urls) {
    await deleteStoredImage(url);
  }

  const shop = await getShopProfile(user.id);
  revalidateProductSurfaces(shop?.shop_slug ?? null);
  redirect("/products?deleted=1");
}
