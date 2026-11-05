import { getDb, plainRow, plainRows } from "../db";
import type { OrderEvent, OrderItem } from "../domain/types";

/**
 * Cross-tenant reads for the admin area.
 *
 * Every function here returns data from all sellers. They must only be called
 * from routes guarded by `requireAdmin()` — the seller-facing repositories remain
 * scoped by `seller_id` on purpose.
 */

export type AdminOverview = {
  sellers: number;
  customers: number;
  shops: number;
  publishedProducts: number;
  orders: number;
  pendingPayments: number;
  confirmedPayments: number;
  receiptsAwaitingReview: number;
  deliveriesConfirmedByCustomer: number;
  grossPaidKobo: number;
  outstandingKobo: number;
};

async function one(sql: string, params: unknown[] = []): Promise<number> {
  const row = (await (await getDb()).prepare(sql).get(...(params as never[]))) as { c: number } | undefined;
  return Number(row?.c ?? 0);
}

export async function adminOverview(): Promise<AdminOverview> {
  return {
    sellers: await one("SELECT COUNT(*) AS c FROM users WHERE role = 'seller' AND account_type = 'seller'"),
    customers: await one("SELECT COUNT(*) AS c FROM users WHERE account_type = 'customer'"),
    shops: await one("SELECT COUNT(*) AS c FROM users WHERE shop_slug IS NOT NULL AND account_type = 'seller'"),
    publishedProducts: await one("SELECT COUNT(*) AS c FROM products WHERE publication_status = 'published'"),
    orders: await one("SELECT COUNT(*) AS c FROM orders"),
    pendingPayments: await one(
      "SELECT COUNT(*) AS c FROM orders WHERE payment_status IN ('unpaid','partial') AND status != 'cancelled'",
    ),
    confirmedPayments: await one("SELECT COUNT(*) AS c FROM orders WHERE payment_status = 'paid'"),
    receiptsAwaitingReview: await one("SELECT COUNT(*) AS c FROM orders WHERE receipt_url IS NOT NULL AND payment_status != 'paid'"),
    deliveriesConfirmedByCustomer: await one("SELECT COUNT(*) AS c FROM orders WHERE received_confirmed_at IS NOT NULL"),
    grossPaidKobo: await one("SELECT COALESCE(SUM(paid_kobo), 0) AS c FROM orders"),
    outstandingKobo: await one(
      `SELECT COALESCE(SUM(CASE WHEN payment_status IN ('unpaid','partial') AND status != 'cancelled'
                THEN COALESCE(amount_due_online_kobo, total_kobo) - paid_kobo ELSE 0 END), 0) AS c
       FROM orders`,
    ),
  };
}

export type AdminPaymentRow = {
  id: string;
  reference: string;
  status: string;
  payment_status: string;
  total_kobo: number;
  paid_kobo: number;
  amount_due_online_kobo: number | null;
  receipt_url: string | null;
  receipt_uploaded_at: string | null;
  received_confirmed_at: string | null;
  created_at: string;
  shop_name: string;
  shop_slug: string | null;
  seller_id: string;
  customer_name: string;
  customer_phone: string;
  buyer_user_id: string | null;
  buyer_email: string | null;
};

export type PaymentFilter = "all" | "pending" | "confirmed" | "receipts";

/** Every order across every seller, for the payment/dispute view. */
export async function adminPayments(options: {
  filter?: PaymentFilter;
  query?: string;
  limit?: number;
} = {}): Promise<AdminPaymentRow[]> {
  const filter = options.filter ?? "all";
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const query = options.query?.trim() || null;

  const where: string[] = [];
  const params: (string | number | null)[] = [];

  if (filter === "pending") {
    where.push("o.payment_status IN ('unpaid','partial')", "o.status != 'cancelled'");
  } else if (filter === "confirmed") {
    where.push("o.payment_status = 'paid'");
  } else if (filter === "receipts") {
    where.push("o.receipt_url IS NOT NULL");
  }

  if (query) {
    where.push(
      "(LOWER(o.reference) LIKE LOWER(?) OR LOWER(u.shop_name) LIKE LOWER(?) OR LOWER(u.business_name) LIKE LOWER(?) OR LOWER(c.name) LIKE LOWER(?) OR LOWER(c.phone) LIKE LOWER(?))",
    );
    params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
  }

  const clause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  return plainRows<AdminPaymentRow>(
    await (await getDb())
      .prepare(
        `SELECT o.id, o.reference, o.status, o.payment_status, o.total_kobo, o.paid_kobo,
                o.amount_due_online_kobo, o.receipt_url, o.receipt_uploaded_at,
                o.received_confirmed_at, o.created_at,
                COALESCE(u.shop_name, u.business_name) AS shop_name,
                u.shop_slug, u.id AS seller_id,
                c.name AS customer_name, c.phone AS customer_phone,
                o.buyer_user_id, buyer.email AS buyer_email
         FROM orders o
         JOIN users u ON u.id = o.seller_id
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users buyer ON buyer.id = o.buyer_user_id
         ${clause}
         ORDER BY o.created_at DESC
         LIMIT ?`,
      )
      .all(...params, limit),
  ).map((row) => ({
    ...row,
    total_kobo: Number(row.total_kobo),
    paid_kobo: Number(row.paid_kobo),
    amount_due_online_kobo:
      row.amount_due_online_kobo === null ? null : Number(row.amount_due_online_kobo),
  }));
}

export type AdminOrderDetail = AdminPaymentRow & {
  items: OrderItem[];
  events: OrderEvent[];
  delivery_address: string | null;
  notes: string | null;
  receipt_note: string | null;
  delivery_fee_kobo: number;
  delivery_fee_on_delivery: number;
  seller_email: string | null;
  seller_phone: string | null;
};

/**
 * Finds one order by the reference ID customers quote in a dispute, with its
 * receipt and full timeline. Reference lookup is case-insensitive.
 */
export async function adminOrderByReference(
  reference: string,
): Promise<AdminOrderDetail | null> {
  const row = plainRow<AdminOrderDetail>(
    await (await getDb())
      .prepare(
        `SELECT o.id, o.reference, o.status, o.payment_status, o.total_kobo, o.paid_kobo,
                o.amount_due_online_kobo, o.receipt_url, o.receipt_uploaded_at,
                o.received_confirmed_at, o.created_at, o.receipt_note,
                o.delivery_address, o.notes, o.delivery_fee_kobo, o.delivery_fee_on_delivery,
                COALESCE(u.shop_name, u.business_name) AS shop_name,
                u.shop_slug, u.id AS seller_id, u.email AS seller_email, u.phone AS seller_phone,
                c.name AS customer_name, c.phone AS customer_phone,
                o.buyer_user_id, buyer.email AS buyer_email
         FROM orders o
         JOIN users u ON u.id = o.seller_id
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users buyer ON buyer.id = o.buyer_user_id
         WHERE upper(o.reference) = upper(?)
         LIMIT 1`,
      )
      .get(reference.trim()),
  );

  if (!row) return null;

  const items = plainRows<OrderItem>(
    await (await getDb()).prepare("SELECT * FROM order_items WHERE order_id = ?").all(row.id),
  );
  const events = plainRows<OrderEvent>(
    await (await getDb())
      .prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC")
      .all(row.id),
  );

  return {
    ...row,
    items,
    events,
    total_kobo: Number(row.total_kobo),
    paid_kobo: Number(row.paid_kobo),
    delivery_fee_kobo: Number(row.delivery_fee_kobo),
    amount_due_online_kobo:
      row.amount_due_online_kobo === null ? null : Number(row.amount_due_online_kobo),
  };
}

export type AdminShopRow = {
  id: string;
  shop_name: string;
  shop_slug: string | null;
  owner_name: string;
  email: string;
  products: number;
  orders: number;
  paid_kobo: number;
  created_at: string;
};

/** Every seller with their catalogue and sales totals, for the admin list. */
export async function adminShops(limit = 100): Promise<AdminShopRow[]> {
  return plainRows<AdminShopRow>(
    await (await getDb())
      .prepare(
        `SELECT u.id,
                COALESCE(u.shop_name, u.business_name) AS shop_name,
                u.shop_slug, u.owner_name, u.email, u.created_at,
                (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id) AS products,
                (SELECT COUNT(*) FROM orders o WHERE o.seller_id = u.id) AS orders,
                (SELECT COALESCE(SUM(o.paid_kobo), 0) FROM orders o WHERE o.seller_id = u.id) AS paid_kobo
         FROM users u
         WHERE u.account_type = 'seller'
         ORDER BY u.created_at DESC
         LIMIT ?`,
      )
      .all(Math.min(Math.max(limit, 1), 500)),
  ).map((row) => ({
    ...row,
    products: Number(row.products),
    orders: Number(row.orders),
    paid_kobo: Number(row.paid_kobo),
  }));
}

export type AdminCustomerRow = {
  id: string;
  owner_name: string;
  email: string;
  phone: string | null;
  orders: number;
  created_at: string;
};

export async function adminCustomers(limit = 100): Promise<AdminCustomerRow[]> {
  return plainRows<AdminCustomerRow>(
    await (await getDb())
      .prepare(
        `SELECT u.id, u.owner_name, u.email, u.phone, u.created_at,
                (SELECT COUNT(*) FROM orders o WHERE o.buyer_user_id = u.id) AS orders
         FROM users u
         WHERE u.account_type = 'customer'
         ORDER BY u.created_at DESC
         LIMIT ?`,
      )
      .all(Math.min(Math.max(limit, 1), 500)),
  ).map((row) => ({ ...row, orders: Number(row.orders) }));
}
