import { appUrl } from "../config";
import { getDb, nowIso, plainRow } from "../db";
import { newId } from "../domain/ids";
import { sendEmail, type EmailResult } from "./transport";
import {
  outForDeliveryEmail,
  sellerNewOrderEmail,
  type OrderEmailData,
} from "./templates";

/**
 * Order notifications.
 *
 * Exactly-once is enforced by `email_events` (unique on order_id + kind): the row
 * is reserved *before* sending, so a repeated status update or a double-submitted
 * webhook cannot send a second email.
 *
 * Notifications are always best-effort. Every function here swallows its own
 * errors — an order must never fail because email did.
 */

export type NotificationKind = "seller_new_order" | "customer_out_for_delivery";

type OrderRow = {
  id: string;
  reference: string;
  status: string;
  payment_status: string;
  total_kobo: number;
  delivery_address: string | null;
  public_token: string | null;
  buyer_user_id: string | null;
  seller_email: string;
  shop_name: string;
  customer_name: string;
  customer_phone: string | null;
  buyer_email: string | null;
};

async function loadOrder(orderId: string): Promise<{
  row: OrderRow;
  items: { name: string; quantity: number; unitPriceKobo: number }[];
  imageUrl: string | null;
} | null> {
  const db = await getDb();

  const row = plainRow<OrderRow & { total_kobo: number }>(
    await db.prepare(
      `SELECT o.id, o.reference, o.status, o.payment_status, o.total_kobo,
              o.delivery_address, o.public_token, o.buyer_user_id,
              u.email AS seller_email,
              COALESCE(u.shop_name, u.business_name) AS shop_name,
              c.name AS customer_name, c.phone AS customer_phone,
              b.email AS buyer_email
         FROM orders o
         JOIN users u ON u.id = o.seller_id
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users b ON b.id = o.buyer_user_id
        WHERE o.id = ?`,
    ).get(orderId),
  );

  if (!row) return null;

  const rawItems = await db.prepare(
    "SELECT description AS name, quantity, unit_price_kobo FROM order_items WHERE order_id = ?",
  ).all(orderId);

  const items = (rawItems as { name: string; quantity: number; unit_price_kobo: number }[]).map(
    (item) => ({
      name: item.name,
      quantity: Number(item.quantity),
      unitPriceKobo: Number(item.unit_price_kobo),
    }),
  );

  const image = await db.prepare(
    `SELECT i.url
       FROM product_images i
       JOIN order_items oi ON oi.product_id = i.product_id
      WHERE oi.order_id = ?
      ORDER BY i.position ASC
      LIMIT 1`,
  ).get(orderId);

  return {
    row: { ...row, total_kobo: Number(row.total_kobo) },
    items,
    imageUrl: (image as { url?: string } | null)?.url ?? null,
  };
}

function emailData(
  row: OrderRow,
  items: { name: string; quantity: number; unitPriceKobo: number }[],
  imageUrl: string | null,
  orderUrl: string,
): OrderEmailData {
  return {
    reference: row.reference,
    shopName: row.shop_name,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    totalKobo: row.total_kobo,
    paymentStatus: row.payment_status,
    status: row.status,
    items,
    deliveryAddress: row.delivery_address,
    orderUrl,
    imageUrl,
    supportEmail: "kandcshopping11@gmail.com",
  };
}

/** Reserves the (order, kind) slot. False when it was already handled. */
async function reserve(
  orderId: string,
  kind: NotificationKind,
  recipient: string,
  status: "pending" | "skipped",
): Promise<{ reserved: boolean; id: string }> {
  const db = await getDb();
  const id = newId();
  const timestamp = nowIso();

  const result = await db.run(
    `INSERT INTO email_events (id, order_id, kind, recipient, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (order_id, kind) DO NOTHING`,
    id,
    orderId,
    kind,
    recipient,
    status,
    timestamp,
    timestamp,
  );

  return { reserved: Number(result.changes) > 0, id };
}

async function finish(id: string, result: EmailResult): Promise<void> {
  const db = await getDb();
  const status = result.ok ? (result.skipped ? "skipped" : "sent") : "failed";

  await db.run(
    `UPDATE email_events
        SET status = ?, provider_id = ?, error = ?, attempts = attempts + 1, updated_at = ?
      WHERE id = ?`,
    status,
    result.providerId ?? null,
    result.error ?? null,
    nowIso(),
    id,
  );
}

/**
 * Sends the seller an email about a new customer order. Safe to call more than
 * once: the second call is a no-op.
 */
export async function notifySellerNewOrder(orderId: string): Promise<void> {
  try {
    const loaded = await loadOrder(orderId);
    if (!loaded) return;

    const recipient = loaded.row.seller_email;
    const { reserved, id } = await reserve(orderId, "seller_new_order", recipient, recipient ? "pending" : "skipped");
    if (!reserved) return;
    if (!recipient) return;

    const message = sellerNewOrderEmail(
      emailData(loaded.row, loaded.items, loaded.imageUrl, `${appUrl()}/orders/${loaded.row.id}`),
    );

    await finish(id, await sendEmail({ to: recipient, ...message }));
  } catch (error) {
    console.error("[email] seller notification failed:", error);
  }
}

/**
 * Sends the customer an email when the order goes out for delivery. Guests
 * without an email address are recorded as skipped rather than retried forever.
 */
export async function notifyCustomerOutForDelivery(orderId: string): Promise<void> {
  try {
    const loaded = await loadOrder(orderId);
    if (!loaded) return;

    const recipient = loaded.row.buyer_email ?? "";
    const { reserved, id } = await reserve(
      orderId,
      "customer_out_for_delivery",
      recipient,
      recipient ? "pending" : "skipped",
    );
    if (!reserved) return;
    if (!recipient) return;

    const orderUrl = loaded.row.buyer_user_id
      ? `${appUrl()}/account`
      : loaded.row.public_token
        ? `${appUrl()}/order/${loaded.row.public_token}`
        : `${appUrl()}/login`;

    const message = outForDeliveryEmail(
      emailData(loaded.row, loaded.items, loaded.imageUrl, orderUrl),
    );

    await finish(id, await sendEmail({ to: recipient, ...message }));
  } catch (error) {
    console.error("[email] customer notification failed:", error);
  }
}

/**
 * Re-sends notifications that previously failed (for example while the email
 * provider was unreachable). Bounded per call so it is safe to run from a cron
 * job or by hand.
 */
export async function retryFailedEmails(limit = 20): Promise<{ sent: number; failed: number; skipped: number }> {
  const db = await getDb();
  const rows = (await db.prepare(
    `SELECT id, order_id, kind, attempts
       FROM email_events
      WHERE status = 'failed' AND attempts < 3
      ORDER BY created_at ASC
      LIMIT ?`,
  ).all(Math.min(Math.max(limit, 1), 100))) as {
    id: string;
    order_id: string;
    kind: NotificationKind;
    attempts: number;
  }[];

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const loaded = await loadOrder(row.order_id);
    if (!loaded) continue;

    const recipient =
      row.kind === "seller_new_order" ? loaded.row.seller_email : loaded.row.buyer_email ?? "";

    if (!recipient) {
      await db.run(
        "UPDATE email_events SET status = 'skipped', updated_at = ? WHERE id = ?",
        nowIso(),
        row.id,
      );
      skipped += 1;
      continue;
    }

    const orderUrl =
      row.kind === "seller_new_order"
        ? `${appUrl()}/orders/${row.order_id}`
        : loaded.row.buyer_user_id
          ? `${appUrl()}/account`
          : loaded.row.public_token
            ? `${appUrl()}/order/${loaded.row.public_token}`
            : `${appUrl()}/login`;

    const data = emailData(loaded.row, loaded.items, loaded.imageUrl, orderUrl);
    const message = row.kind === "seller_new_order" ? sellerNewOrderEmail(data) : outForDeliveryEmail(data);

    const result = await sendEmail({ to: recipient, ...message });
    await finish(row.id, result);

    if (result.ok) sent += 1;
    else failed += 1;
  }

  return { sent, failed, skipped };
}