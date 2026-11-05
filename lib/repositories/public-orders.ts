import { createHash } from "node:crypto";
import { getDb, nowIso, plainRow } from "../db";
import { newId, publicOrderToken } from "../domain/ids";
import {
  MAX_PUBLIC_QUANTITY,
  PUBLIC_ORDER_ATTEMPT_RETENTION_DAYS,
  PUBLIC_ORDER_MAX_PER_HOUR,
  PUBLIC_ORDER_MAX_PER_WINDOW,
  PUBLIC_ORDER_RATE_WINDOW_MINUTES,
} from "../domain/public-order";
import type { PublicOrderView } from "../domain/types";
import { ValidationError, normalisePhone } from "../domain/validation";
import { createOrder } from "./orders";
import { getPublicProduct } from "./products";

/**
 * Anonymous ordering from a shared product link.
 *
 * Everything the client sends is treated as untrusted input: the product and its
 * price are re-read from the database, the seller is derived from the shop slug,
 * and submissions are rate limited per IP.
 */

export { MAX_PUBLIC_QUANTITY };

export type PublicOrderInput = {
  shopSlug: string;
  productSlug: string;
  name: string;
  phone: string;
  quantity: number;
  address?: string | null;
  notes?: string | null;
  /** Salted hash of the client IP; never the raw address. */
  ipHash?: string | null;
  /** Hidden field that humans leave empty. */
  honeypot?: string | null;
  /** The signed-in customer placing the order. */
  buyerUserId?: string | null;
};

export type PublicOrderResult = {
  orderId: string;
  reference: string;
  token: string;
  totalKobo: number;
  /** Goods amount to transfer now (excludes delivery paid on delivery). */
  amountDueOnlineKobo: number;
  deliveryFeeKobo: number;
};

/**
 * Hashes an IP address with a per-day salt, so the rate-limit table cannot be
 * used to recover visitor addresses.
 */
export function hashClientIp(ip: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const salt = process.env.ORDERPILOT_IP_SALT ?? "kandc";
  return createHash("sha256").update(`${salt}:${day}:${ip}`).digest("hex").slice(0, 40);
}

async function recordAttempt(
  productId: string | null,
  ipHash: string,
  outcome: "accepted" | "rejected" | "bot",
): Promise<void> {
  await (await getDb())
    .prepare(
      "INSERT INTO public_order_attempts (id, product_id, ip_hash, outcome, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(newId(), productId, ipHash, outcome, nowIso());
}

async function countAttempts(ipHash: string, sinceMinutes: number): Promise<number> {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
  const row = await (await getDb())
    .prepare("SELECT COUNT(*) AS total FROM public_order_attempts WHERE ip_hash = ? AND created_at > ?")
    .get<{ total: number }>(ipHash, since);
  return Number(row?.total ?? 0);
}

/** True when this IP has already made too many attempts. */
export async function isRateLimited(ipHash: string): Promise<boolean> {
  return (
    (await countAttempts(ipHash, PUBLIC_ORDER_RATE_WINDOW_MINUTES)) >= PUBLIC_ORDER_MAX_PER_WINDOW ||
    (await countAttempts(ipHash, 60)) >= PUBLIC_ORDER_MAX_PER_HOUR
  );
}

/** Housekeeping: drop attempt rows after the retention window. */
export async function pruneAttempts(olderThanDays = PUBLIC_ORDER_ATTEMPT_RETENTION_DAYS): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  await (await getDb()).prepare("DELETE FROM public_order_attempts WHERE created_at < ?").run(cutoff);
}

export async function createPublicOrder(input: PublicOrderInput): Promise<PublicOrderResult> {
  const ipHash = input.ipHash ?? hashClientIp("unknown");
  const product = await getPublicProduct(input.shopSlug, input.productSlug);

  if (!product) {
    throw new ValidationError([
      { field: "product", message: "This product is no longer available." },
    ]);
  }

  // Hidden field: only bots fill it in. Record and refuse without detail.
  if (input.honeypot && input.honeypot.trim() !== "") {
    await recordAttempt(product.id, ipHash, "bot");
    throw new ValidationError([
      { field: "form", message: "We could not place that order. Please try again." },
    ]);
  }

  if (await isRateLimited(ipHash)) {
    await recordAttempt(product.id, ipHash, "rejected");
    throw new ValidationError([
      {
        field: "form",
        message: "Too many order attempts from this device. Please try again in a few minutes.",
      },
    ]);
  }

  const fieldErrors: { field: string; message: string }[] = [];

  const name = input.name?.trim() ?? "";
  if (name.length < 2) fieldErrors.push({ field: "name", message: "Enter your name." });
  if (name.length > 120) fieldErrors.push({ field: "name", message: "That name is too long." });

  const phone = normalisePhone(input.phone ?? "");
  if (!phone) {
    fieldErrors.push({
      field: "phone",
      message: "Enter a valid phone number, for example 0803 123 4567.",
    });
  }

  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PUBLIC_QUANTITY) {
    fieldErrors.push({
      field: "quantity",
      message: `Choose a quantity between 1 and ${MAX_PUBLIC_QUANTITY}.`,
    });
  }

  const address = input.address?.trim() || null;
  if (address && address.length < 5) {
    fieldErrors.push({ field: "address", message: "That address looks too short." });
  }
  if (address && address.length > 300) {
    fieldErrors.push({ field: "address", message: "Keep the address under 300 characters." });
  }

  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 500) {
    fieldErrors.push({ field: "notes", message: "Keep notes under 500 characters." });
  }

  if (fieldErrors.length > 0) {
    // Invalid submissions count towards the limit so scripts cannot probe freely.
    await recordAttempt(product.id, ipHash, "rejected");
    throw new ValidationError(fieldErrors);
  }

  if (product.availability !== "available") {
    throw new ValidationError([
      { field: "product", message: "This product is out of stock right now." },
    ]);
  }

  const token = publicOrderToken();

  // The seller advertises a delivery fee that is collected by the rider, so it is
  // recorded on the order but excluded from the amount the customer transfers now.
  const deliveryFeeKobo = product.shop.shop_delivery_fee_kobo ?? 0;
  const goodsKobo = product.price_kobo * quantity;

  // Price comes from the database, never from the submitted form.
  const order = await createOrder(product.shop.id, {
    customer: { name, phone: phone as string, address },
    items: [
      {
        description: product.name,
        quantity,
        unitPriceKobo: product.price_kobo,
        productId: product.id,
      },
    ],
    deliveryFeeKobo,
    deliveryAddress: address,
    notes,
    source: "product_link",
    productId: product.id,
    publicToken: token,
    buyerUserId: input.buyerUserId ?? null,
    deliveryFeeOnDelivery: deliveryFeeKobo > 0,
    amountDueOnlineKobo: goodsKobo,
  });

  await recordAttempt(product.id, ipHash, "accepted");

  return {
    orderId: order.id,
    reference: order.reference,
    token,
    totalKobo: order.total_kobo,
    amountDueOnlineKobo: goodsKobo,
    deliveryFeeKobo,
  };
}

/**
 * Looks up an order by its confirmation token. Returns only the facts the
 * customer needs — never their own details or the seller's account data.
 */
export async function getPublicOrderByToken(token: string): Promise<PublicOrderView | null> {
  if (!/^[0-9a-f]{48}$/i.test(token)) return null;

  const row = await (await getDb())
    .prepare(
      `SELECT o.id AS order_id,
              o.reference,
              o.status,
              o.payment_status,
              o.total_kobo,
              COALESCE(o.amount_due_online_kobo, o.total_kobo) AS amount_due_online_kobo,
              o.delivery_fee_kobo,
              o.delivery_fee_on_delivery,
              o.receipt_url,
              o.received_confirmed_at,
              o.created_at,
              COALESCE(u.shop_name, u.business_name) AS shop_name,
              u.shop_slug,
              u.shop_contact_phone AS shop_phone,
              u.shop_bank_name,
              u.shop_account_name,
              u.shop_account_number,
              i.description AS product_name,
              i.quantity,
              i.unit_price_kobo
       FROM orders o
       JOIN users u ON u.id = o.seller_id
       JOIN order_items i ON i.order_id = o.id
       WHERE o.public_token = ?
       LIMIT 1`,
    )
    .get(token.toLowerCase());

  return plainRow<PublicOrderView>(row);
}
