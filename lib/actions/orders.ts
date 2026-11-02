"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "../auth/session";
import { parseNairaToKobo } from "../domain/money";
import { isOrderStatus, type OrderStatus } from "../domain/status";
import { ValidationError } from "../domain/validation";
import {
  createOrder,
  recordPayment,
  refundOrder,
  updateOrderNotes,
  updateOrderStatus,
  type NewOrderItem,
} from "../repositories/orders";
import { failure, formList, formText, type ActionState } from "./types";

export async function createOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  try {
    const descriptions = formList(formData, "itemDescription");
    const quantities = formList(formData, "itemQuantity");
    const prices = formList(formData, "itemPrice");

    const items: NewOrderItem[] = [];
    for (let index = 0; index < descriptions.length; index += 1) {
      const description = descriptions[index];
      const priceRaw = prices[index] ?? "";
      if (description === "" && priceRaw === "") continue;

      const unitPriceKobo = parseNairaToKobo(priceRaw);
      if (unitPriceKobo === null) {
        throw new ValidationError([
          { field: `itemPrice.${index}`, message: "Enter a valid price for the item." },
        ]);
      }

      items.push({
        description,
        quantity: Number.parseInt(quantities[index] ?? "1", 10) || 1,
        unitPriceKobo,
      });
    }

    if (items.length === 0) {
      throw new ValidationError([{ field: "items", message: "Add at least one item." }]);
    }

    const customerMode = formText(formData, "customerMode") || "existing";
    const customerId = customerMode === "existing" ? formText(formData, "customerId") : "";
    const customerName = formText(formData, "customerName");
    const customerPhone = formText(formData, "customerPhone");
    const customerAddress = formText(formData, "customerAddress");

    if (customerMode === "existing" && !customerId) {
      throw new ValidationError([{ field: "customerId", message: "Choose a customer." }]);
    }
    if (customerMode === "new" && (!customerName || !customerPhone)) {
      throw new ValidationError([
        {
          field: !customerName ? "customerName" : "customerPhone",
          message: !customerName ? "Enter the customer's name." : "Enter the customer's phone number.",
        },
      ]);
    }

    const deliveryFeeKobo = parseNairaToKobo(formText(formData, "deliveryFee") || "0");
    if (deliveryFeeKobo === null) {
      throw new ValidationError([{ field: "deliveryFee", message: "Enter a valid delivery fee." }]);
    }

    const deliveryAddress = formText(formData, "deliveryAddress") || customerAddress || null;

    const order = createOrder(user.id, {
      customer: {
        id: customerId || undefined,
        name: customerName,
        phone: customerPhone,
        address: customerAddress || null,
      },
      items,
      deliveryFeeKobo,
      deliveryAddress,
      notes: formText(formData, "notes") || null,
      source: "manual",
    });

    revalidatePath("/orders");
    revalidatePath("/dashboard");
    redirect(`/orders/${order.id}?created=1`);
  } catch (error) {
    // `redirect` throws a control-flow error that must not be swallowed.
    if (isRedirectError(error)) throw error;
    return failure(error, "We could not save that order.");
  }
}

export async function updateOrderStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const orderId = formText(formData, "orderId");
  const status = formText(formData, "status");

  if (!orderId || !isOrderStatus(status)) return;

  try {
    updateOrderStatus(user.id, orderId, status as OrderStatus);
  } catch (error) {
    console.error("[order status]", error);
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/dashboard");
}

export async function recordPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const orderId = formText(formData, "orderId");
  const amountKobo = parseNairaToKobo(formText(formData, "amount"));

  try {
    if (!orderId) throw new ValidationError([{ field: "id", message: "Order not found." }]);
    if (amountKobo === null || amountKobo <= 0) {
      throw new ValidationError([{ field: "amount", message: "Enter the amount you received." }]);
    }

    recordPayment(user.id, orderId, amountKobo);
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/payments");
    revalidatePath("/dashboard");
    return { ok: true, message: "Payment recorded." };
  } catch (error) {
    return failure(error, "We could not record that payment.");
  }
}

export async function refundOrderAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const orderId = formText(formData, "orderId");
  if (!orderId) return;
  try {
    refundOrder(user.id, orderId);
  } catch (error) {
    console.error("[refund]", error);
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/payments");
}

export async function updateOrderNotesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const orderId = formText(formData, "orderId");

  try {
    if (!orderId) throw new ValidationError([{ field: "id", message: "Order not found." }]);
    const deliveryFeeKobo = parseNairaToKobo(formText(formData, "deliveryFee") || "0");
    if (deliveryFeeKobo === null) {
      throw new ValidationError([{ field: "deliveryFee", message: "Enter a valid delivery fee." }]);
    }

    updateOrderNotes(user.id, orderId, {
      deliveryAddress: formText(formData, "deliveryAddress") || null,
      notes: formText(formData, "notes") || null,
      deliveryFeeKobo,
    });
    revalidatePath(`/orders/${orderId}`);
    return { ok: true, message: "Order details saved." };
  } catch (error) {
    return failure(error, "We could not save those details.");
  }
}

/** Next.js signals redirects by throwing; detect that so we can rethrow it. */
function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

