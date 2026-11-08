import { getDb, nowIso, plainRow, plainRows } from "../db";
import { notifyCustomerOutForDelivery } from "../email/notify";
import { newId, orderReference } from "../domain/ids";
import { lineTotal, sumKobo } from "../domain/money";
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  derivePaymentStatus,
  type OrderSource,
  type OrderStatus,
  type PaymentStatus,
} from "../domain/status";
import type { Order, OrderDetail, OrderEvent, OrderItem, OrderWithCustomer } from "../domain/types";
import { ValidationError, requirePositiveInt, requiredString } from "../domain/validation";
import { findOrCreateCustomer, getCustomer } from "./customers";

export type NewOrderItem = {
  description: string;
  quantity: number;
  unitPriceKobo: number;
  productId?: string | null;
};

export type CreateOrderInput = {
  customer: {
    id?: string;
    name: string;
    phone: string;
    address?: string | null;
  };
  items: NewOrderItem[];
  deliveryFeeKobo?: number;
  deliveryAddress?: string | null;
  notes?: string | null;
  source?: OrderSource;
  /** The product a shared link pointed at. */
  productId?: string | null;
  /** Set for orders placed from a public link; drives the customer's confirmation page. */
  publicToken?: string | null;
  /** The signed-in customer who placed the order, when there is one. */
  buyerUserId?: string | null;
  /** Collect the delivery fee on delivery instead of by transfer. */
  deliveryFeeOnDelivery?: boolean;
  /** Overrides how much the customer must transfer now. */
  amountDueOnlineKobo?: number | null;
};

export type OrderFilters = {
  status?: OrderStatus | "all" | "open";
  paymentStatus?: PaymentStatus | "all";
  source?: OrderSource | "all";
  customerId?: string;
  query?: string;
  limit?: number;
};

function itemSummary(items: OrderItem[]): string | null {
  if (items.length === 0) return null;
  const [first] = items;
  const label = `${first.description} x${first.quantity}`;
  return items.length > 1 ? `${label} +${items.length - 1} more` : label;
}

type OrderRow = Order & { customer_name: string; customer_phone: string };

/**
 * Reads the order list for one seller. Multi-line item summaries are resolved in
 * a second query to keep this a single round trip rather than N+1 per order.
 */
export async function listOrders(
  sellerId: string,
  filters: OrderFilters = {},
): Promise<OrderWithCustomer[]> {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const query = filters.query?.trim() || null;

  const where: string[] = ["o.seller_id = ?"];
  const params: (string | number | null)[] = [sellerId];

  if (filters.status && filters.status !== "all") {
    if (filters.status === "open") {
      where.push("o.status NOT IN ('delivered', 'cancelled')");
    } else {
      where.push("o.status = ?");
      params.push(filters.status);
    }
  }
  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    where.push("o.payment_status = ?");
    params.push(filters.paymentStatus);
  }
  if (filters.source && filters.source !== "all") {
    where.push("o.source = ?");
    params.push(filters.source);
  }
  if (filters.customerId) {
    where.push("o.customer_id = ?");
    params.push(filters.customerId);
  }
  if (query) {
    where.push(
      "(LOWER(o.reference) LIKE LOWER(?) OR LOWER(c.name) LIKE LOWER(?) OR LOWER(c.phone) LIKE LOWER(?))",
    );
    params.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }

  const rows = (await (await getDb())
    .prepare(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
       FROM orders o
       JOIN customers c ON c.id = o.customer_id AND c.seller_id = o.seller_id
       WHERE ${where.join(" AND ")}
       ORDER BY o.created_at DESC
       LIMIT ?`,
    )
    .all(...params, limit)) as unknown as OrderRow[];

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(", ");
  const itemRows = (await (await getDb())
    .prepare(
      `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .all(...ids)) as unknown as OrderItem[];

  const byOrder = new Map<string, OrderItem[]>();
  for (const item of itemRows) {
    const bucket = byOrder.get(item.order_id) ?? [];
    bucket.push(item);
    byOrder.set(item.order_id, bucket);
  }

  return rows.map((row) => ({
    ...row,
    item_summary: itemSummary(byOrder.get(row.id) ?? []),
  }));
}

export async function getOrderDetail(
  sellerId: string,
  orderId: string,
): Promise<OrderDetail | null> {
  const row = (await (await getDb())
    .prepare(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
       FROM orders o
       JOIN customers c ON c.id = o.customer_id AND c.seller_id = o.seller_id
       WHERE o.id = ? AND o.seller_id = ?`,
    )
    .get(orderId, sellerId)) as unknown as OrderRow | undefined;

  if (!row) return null;

  const items = plainRows<OrderItem>(
    await (await getDb())
      .prepare("SELECT * FROM order_items WHERE order_id = ? AND seller_id = ? ORDER BY created_at ASC")
      .all(orderId, sellerId),
  );

  const events = plainRows<OrderEvent>(
    await (await getDb())
      .prepare("SELECT * FROM order_events WHERE order_id = ? AND seller_id = ? ORDER BY created_at ASC")
      .all(orderId, sellerId),
  );

  const followUps = plainRows<OrderDetail["followUps"][number]>(
    await (await getDb())
      .prepare("SELECT * FROM follow_ups WHERE order_id = ? AND seller_id = ? ORDER BY due_at ASC")
      .all(orderId, sellerId),
  );

  return {
    ...(plainRow<OrderRow>(row) as OrderRow),
    items,
    events,
    followUps,
    item_summary: itemSummary(items),
  };
}

async function uniqueReference(): Promise<string> {
  const db = await getDb();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const reference = orderReference();
    const existing = await db.prepare("SELECT 1 FROM orders WHERE reference = ?").get(reference);
    if (!existing) return reference;
  }
  throw new Error("Could not allocate an order reference. Please try again.");
}

export async function createOrder(
  sellerId: string,
  input: CreateOrderInput,
): Promise<OrderDetail> {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ValidationError([{ field: "items", message: "Add at least one item to the order." }]);
  }
  if (input.items.length > 20) {
    throw new ValidationError([{ field: "items", message: "An order can hold up to 20 items." }]);
  }

  const normalisedItems = input.items.map((item) => {
    const description = requiredString(item.description, "description", "Item name", { max: 200 });
    const quantity = requirePositiveInt(item.quantity, "quantity", "Quantity");
    if (!Number.isInteger(item.unitPriceKobo) || item.unitPriceKobo < 0) {
      throw new ValidationError([{ field: "unitPrice", message: "Enter a valid unit price." }]);
    }
    return {
      description,
      quantity,
      unitPriceKobo: item.unitPriceKobo,
      productId: item.productId ?? null,
      lineTotalKobo: lineTotal(item.unitPriceKobo, quantity),
    };
  });

  const deliveryFeeKobo = Math.max(0, Math.trunc(input.deliveryFeeKobo ?? 0));
  const subtotalKobo = sumKobo(normalisedItems.map((item) => item.lineTotalKobo));
  const totalKobo = subtotalKobo + deliveryFeeKobo;
  const deliveryFeeOnDelivery = input.deliveryFeeOnDelivery ? 1 : 0;
  // Delivery collected by the rider is not part of the transfer the customer owes now.
  const dueOnlineKobo =
    input.amountDueOnlineKobo ?? (deliveryFeeOnDelivery === 1 ? subtotalKobo : totalKobo);

  let customerId = input.customer.id;
  if (customerId) {
    const existing = await getCustomer(sellerId, customerId);
    if (!existing) {
      throw new ValidationError([{ field: "customer", message: "Customer not found." }]);
    }
  } else {
    const created = await findOrCreateCustomer(sellerId, {
      name: input.customer.name,
      phone: input.customer.phone,
      address: input.customer.address ?? null,
    });
    customerId = created.id;
  }

  const db = await getDb();
  const orderId = newId();
  const timestamp = nowIso();
  const reference = await uniqueReference();

  await db.transaction(async (tx) => {
    await tx
      .prepare(
        `INSERT INTO orders (
           id, seller_id, customer_id, reference, status, payment_status,
           subtotal_kobo, delivery_fee_kobo, total_kobo, paid_kobo,
           delivery_address, notes, source, product_id, public_token,
           buyer_user_id, delivery_fee_on_delivery, amount_due_online_kobo,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        orderId,
        sellerId,
        customerId,
        reference,
        derivePaymentStatus(totalKobo, 0, dueOnlineKobo),
        subtotalKobo,
        deliveryFeeKobo,
        totalKobo,
        input.deliveryAddress?.trim() || input.customer.address?.trim() || null,
        input.notes?.trim() || null,
        input.source ?? "manual",
        input.productId ?? null,
        input.publicToken ?? null,
        input.buyerUserId ?? null,
        deliveryFeeOnDelivery,
        dueOnlineKobo,
        timestamp,
        timestamp,
      );

    const insertItem = tx.prepare(
      `INSERT INTO order_items (id, order_id, seller_id, product_id, description, quantity, unit_price_kobo, line_total_kobo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const item of normalisedItems) {
      await insertItem.run(
        newId(),
        orderId,
        sellerId,
        item.productId ?? null,
        item.description,
        item.quantity,
        item.unitPriceKobo,
        item.lineTotalKobo,
        timestamp,
      );
    }

    await tx
      .prepare(
        `INSERT INTO order_events (id, order_id, seller_id, type, message, created_at)
         VALUES (?, ?, ?, 'created', ?, ?)`,
      )
      .run(
        newId(),
        orderId,
        sellerId,
        input.source === "product_link"
          ? "Order placed from a shared product link."
          : "Order created.",
        timestamp,
      );
  });

  const detail = await getOrderDetail(sellerId, orderId);
  if (!detail) throw new Error("Order could not be created.");
  return detail;
}

export async function addOrderEvent(
  sellerId: string,
  orderId: string,
  type: string,
  message: string,
): Promise<void> {
  await (await getDb())
    .prepare(
      `INSERT INTO order_events (id, order_id, seller_id, type, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(newId(), orderId, sellerId, type, message, nowIso());
}

export async function updateOrderStatus(
  sellerId: string,
  orderId: string,
  status: OrderStatus,
): Promise<OrderDetail> {
  const order = await getOrderDetail(sellerId, orderId);
  if (!order) throw new ValidationError([{ field: "id", message: "Order not found." }]);

  if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
    throw new ValidationError([{ field: "status", message: "Unknown order status." }]);
  }
  if (status !== order.status && !ORDER_TRANSITIONS[order.status].includes(status)) {
    throw new ValidationError([
      {
        field: "status",
        message: `An order that is ${order.status} cannot move to ${status}.`,
      },
    ]);
  }

  await (await getDb())
    .prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND seller_id = ?")
    .run(status, nowIso(), orderId, sellerId);

  await addOrderEvent(sellerId, orderId, "status", `Status changed to ${status}.`);

  // "ready" is the dispatch step in this order flow: the seller hands the parcel
  // to the rider. The customer is told once, when it actually reaches that state.
  if (status === "ready" && order.status !== "ready") {
    await notifyCustomerOutForDelivery(orderId).catch(() => {});
  }

  return (await getOrderDetail(sellerId, orderId))!;
}

/**
 * Records money the seller has actually received. Payment status is always
 * derived from the amounts on the order — never set by hand.
 */
export async function recordPayment(
  sellerId: string,
  orderId: string,
  amountKobo: number,
): Promise<OrderDetail> {
  const order = await getOrderDetail(sellerId, orderId);
  if (!order) throw new ValidationError([{ field: "id", message: "Order not found." }]);
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw new ValidationError([{ field: "amount", message: "Enter an amount above zero." }]);
  }
  if (order.payment_status === "refunded") {
    throw new ValidationError([
      { field: "amount", message: "This order was refunded; create a new order instead." },
    ]);
  }

  // How much the customer still has to transfer (delivery may be paid on delivery).
  const dueKobo = amountDueOnline(order);
  const remaining = Math.max(0, dueKobo - order.paid_kobo);
  if (remaining === 0) {
    throw new ValidationError([{ field: "amount", message: "This order is already fully paid." }]);
  }

  const applied = Math.min(amountKobo, remaining);
  const paidKobo = order.paid_kobo + applied;
  const nextPaymentStatus = derivePaymentStatus(order.total_kobo, paidKobo, dueKobo);

  await (await getDb())
    .prepare("UPDATE orders SET paid_kobo = ?, payment_status = ?, updated_at = ? WHERE id = ? AND seller_id = ?")
    .run(paidKobo, nextPaymentStatus, nowIso(), orderId, sellerId);

  await addOrderEvent(
    sellerId,
    orderId,
    "payment",
    `Payment of ${(applied / 100).toFixed(2)} recorded.`,
  );
  return (await getOrderDetail(sellerId, orderId))!;
}

/**
 * Seller confirms the receipt the customer uploaded, settling everything the
 * customer was meant to transfer. Delivery collected on delivery is excluded.
 */
export async function confirmReceipt(sellerId: string, orderId: string): Promise<OrderDetail> {
  const order = await getOrderDetail(sellerId, orderId);
  if (!order) throw new ValidationError([{ field: "id", message: "Order not found." }]);

  if (!order.receipt_url) {
    throw new ValidationError([
      { field: "receipt", message: "The customer has not uploaded a receipt yet." },
    ]);
  }

  const remaining = Math.max(0, amountDueOnline(order) - order.paid_kobo);
  if (remaining === 0) return order;

  return recordPayment(sellerId, orderId, remaining);
}

/**
 * Customer confirms delivery. Recorded separately from the seller's own status so
 * the buyer's word is visible to the seller *and* to the admin handling disputes.
 */
export async function confirmReceived(
  orderId: string,
  buyerUserId: string,
): Promise<OrderDetail> {
  const order = await getOrderForBuyer(buyerUserId, orderId);
  if (!order) throw new ValidationError([{ field: "order", message: "Order not found." }]);
  if (order.status === "cancelled") {
    throw new ValidationError([
      { field: "order", message: "This order was cancelled, so it cannot be confirmed." },
    ]);
  }
  if (order.received_confirmed_at) return order;

  const timestamp = nowIso();
  await (await getDb())
    .prepare("UPDATE orders SET received_confirmed_at = ?, updated_at = ? WHERE id = ? AND buyer_user_id = ?")
    .run(timestamp, timestamp, orderId, buyerUserId);

  await addOrderEvent(order.seller_id, orderId, "received", "Customer confirmed they received the order.");
  return (await getOrderForBuyer(buyerUserId, orderId))!;
}

/** Same confirmation, authorised by the order's unguessable public token. */
export async function confirmReceivedByToken(token: string): Promise<void> {
  const row = (await (await getDb())
    .prepare("SELECT id, seller_id, status, received_confirmed_at FROM orders WHERE public_token = ?")
    .get(token.toLowerCase())) as
    | { id: string; seller_id: string; status: string; received_confirmed_at: string | null }
    | undefined;

  if (!row) throw new ValidationError([{ field: "token", message: "Order not found." }]);
  if (row.status === "cancelled") {
    throw new ValidationError([
      { field: "order", message: "This order was cancelled, so it cannot be confirmed." },
    ]);
  }
  if (row.received_confirmed_at) return;

  const timestamp = nowIso();
  await (await getDb())
    .prepare("UPDATE orders SET received_confirmed_at = ?, updated_at = ? WHERE id = ?")
    .run(timestamp, timestamp, row.id);

  await addOrderEvent(row.seller_id, row.id, "received", "Customer confirmed they received the order.");
}

export async function refundOrder(sellerId: string, orderId: string): Promise<OrderDetail> {
  const order = await getOrderDetail(sellerId, orderId);
  if (!order) throw new ValidationError([{ field: "id", message: "Order not found." }]);
  if (order.payment_status === "refunded") return order;

  await (await getDb())
    .prepare("UPDATE orders SET payment_status = 'refunded', updated_at = ? WHERE id = ? AND seller_id = ?")
    .run(nowIso(), orderId, sellerId);
  await addOrderEvent(sellerId, orderId, "payment", "Order marked as refunded.");
  return (await getOrderDetail(sellerId, orderId))!;
}

export async function updateOrderNotes(
  sellerId: string,
  orderId: string,
  input: { deliveryAddress?: string | null; notes?: string | null; deliveryFeeKobo?: number },
): Promise<OrderDetail> {
  const order = await getOrderDetail(sellerId, orderId);
  if (!order) throw new ValidationError([{ field: "id", message: "Order not found." }]);

  const deliveryFeeKobo = Math.max(0, Math.trunc(input.deliveryFeeKobo ?? order.delivery_fee_kobo));
  const totalKobo = order.subtotal_kobo + deliveryFeeKobo;
  // Keep the "pay now" amount consistent when the delivery fee changes.
  const dueOnlineKobo =
    order.delivery_fee_on_delivery === 1 ? order.subtotal_kobo : totalKobo;

  await (await getDb())
    .prepare(
      `UPDATE orders SET delivery_address = ?, notes = ?, delivery_fee_kobo = ?, total_kobo = ?,
         amount_due_online_kobo = ?, payment_status = ?, updated_at = ?
       WHERE id = ? AND seller_id = ?`,
    )
    .run(
      input.deliveryAddress?.trim() || null,
      input.notes?.trim() || null,
      deliveryFeeKobo,
      totalKobo,
      dueOnlineKobo,
      derivePaymentStatus(totalKobo, order.paid_kobo, dueOnlineKobo),
      nowIso(),
      orderId,
      sellerId,
    );

  await addOrderEvent(sellerId, orderId, "note", "Order details updated.");
  return (await getOrderDetail(sellerId, orderId))!;
}

/** Money the customer must transfer (excludes a delivery fee collected on delivery). */
export function amountDueOnline(order: Pick<Order, "total_kobo" | "amount_due_online_kobo">): number {
  return order.amount_due_online_kobo ?? order.total_kobo;
}

/**
 * Attaches the customer's payment receipt. Authorised either by the order's
 * public token (guest flow, kept for support links) or by being the buyer.
 */
export async function attachReceipt(
  orderId: string,
  input: { url: string; note?: string | null; amountKobo?: number | null },
): Promise<void> {
  const order = (await (await getDb()).prepare("SELECT seller_id FROM orders WHERE id = ?").get(orderId)) as
    | { seller_id: string }
    | undefined;
  if (!order) throw new ValidationError([{ field: "order", message: "Order not found." }]);

  await (await getDb())
    .prepare(
      `UPDATE orders
       SET receipt_url = ?, receipt_note = ?, receipt_amount_kobo = ?, receipt_uploaded_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.url,
      input.note?.trim() || null,
      input.amountKobo ?? null,
      nowIso(),
      nowIso(),
      orderId,
    );

  await (await getDb())
    .prepare(
      `INSERT INTO order_events (id, order_id, seller_id, type, message, created_at)
       VALUES (?, ?, ?, 'receipt', ?, ?)`,
    )
    .run(newId(), orderId, order.seller_id, "Payment receipt uploaded by the customer.", nowIso());
}

/** Finds an order for a signed-in customer, without exposing anyone else's. */
export async function getOrderForBuyer(
  buyerUserId: string,
  orderId: string,
): Promise<OrderDetail | null> {
  const row = (await (await getDb())
    .prepare("SELECT seller_id FROM orders WHERE id = ? AND buyer_user_id = ?")
    .get(orderId, buyerUserId)) as { seller_id: string } | undefined;
  if (!row) return null;
  return await getOrderDetail(row.seller_id, orderId);
}

/** A customer's own orders, newest first. */
export async function listOrdersForBuyer(
  buyerUserId: string,
  limit = 100,
): Promise<OrderWithCustomer[]> {
  const rows = plainRows<OrderRow>(
    await (await getDb())
      .prepare(
        `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE o.buyer_user_id = ?
         ORDER BY o.created_at DESC
         LIMIT ?`,
      )
      .all(buyerUserId, Math.min(Math.max(limit, 1), 200)),
  );

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const items = plainRows<OrderItem>(
    await (await getDb())
      .prepare(
        `SELECT * FROM order_items WHERE order_id IN (${ids.map(() => "?").join(", ")})`,
      )
      .all(...ids),
  );

  const byOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const bucket = byOrder.get(item.order_id) ?? [];
    bucket.push(item);
    byOrder.set(item.order_id, bucket);
  }

  return rows.map((row) => ({ ...row, item_summary: itemSummary(byOrder.get(row.id) ?? []) }));
}

export type OrderStats = {
  openOrders: number;
  totalOrders: number;
  unpaidTotalKobo: number;
  paidTotalKobo: number;
  ordersThisMonth: number;
};

export async function orderStats(sellerId: string): Promise<OrderStats> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const row = (await (await getDb())
    .prepare(
      `SELECT
         SUM(CASE WHEN status NOT IN ('delivered', 'cancelled') THEN 1 ELSE 0 END) AS open_orders,
         COUNT(*) AS total_orders,
         COALESCE(SUM(CASE WHEN payment_status != 'paid' AND payment_status != 'refunded'
                           THEN COALESCE(amount_due_online_kobo, total_kobo) - paid_kobo
                           ELSE 0 END), 0) AS unpaid_total,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_kobo ELSE 0 END), 0) AS paid_total,
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS month_orders
       FROM orders WHERE seller_id = ?`,
    )
    .get(monthStart.toISOString(), sellerId)) as unknown as {
    open_orders: number | null;
    total_orders: number | null;
    unpaid_total: number | null;
    paid_total: number | null;
    month_orders: number | null;
  };

  return {
    openOrders: Number(row?.open_orders ?? 0),
    totalOrders: Number(row?.total_orders ?? 0),
    unpaidTotalKobo: Number(row?.unpaid_total ?? 0),
    paidTotalKobo: Number(row?.paid_total ?? 0),
    ordersThisMonth: Number(row?.month_orders ?? 0),
  };
}
