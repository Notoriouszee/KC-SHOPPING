import { getDb, nowIso, plainRow, plainRows } from "../db";
import { newId } from "../domain/ids";
import type { FollowUp } from "../domain/types";
import { ValidationError, requiredString } from "../domain/validation";
import { getCustomer } from "./customers";
import { getOrderDetail } from "./orders";

export type FollowUpInput = {
  title: string;
  dueAt: string;
  notes?: string | null;
  orderId?: string | null;
  customerId?: string | null;
};

export type FollowUpWithContext = FollowUp & {
  customer_name: string | null;
  order_reference: string | null;
};

function assertDueDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError([{ field: "dueAt", message: "Choose a valid follow-up date." }]);
  }
  return parsed.toISOString();
}

export async function listFollowUps(
  sellerId: string,
  options: { status?: "open" | "done" | "cancelled" | "all"; limit?: number } = {},
): Promise<FollowUpWithContext[]> {
  const status = options.status ?? "open";
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);

  const rows = await (await getDb())
    .prepare(
      `SELECT f.*, c.name AS customer_name, o.reference AS order_reference
       FROM follow_ups f
       LEFT JOIN customers c ON c.id = f.customer_id AND c.seller_id = f.seller_id
       LEFT JOIN orders o ON o.id = f.order_id AND o.seller_id = f.seller_id
       WHERE f.seller_id = ?
         AND (? = 'all' OR f.status = ?)
       ORDER BY (f.status = 'open') DESC, f.due_at ASC
       LIMIT ?`,
    )
    .all(sellerId, status, status, limit);

  return plainRows<FollowUpWithContext>(rows);
}

export async function followUpsDueToday(sellerId: string): Promise<FollowUpWithContext[]> {
  const rows = await listFollowUps(sellerId, { status: "open", limit: 50 });
  return rows.filter(
    (item) => new Date(item.due_at).getTime() <= Date.now() + 24 * 60 * 60 * 1000,
  );
}

export async function createFollowUp(
  sellerId: string,
  input: FollowUpInput,
): Promise<FollowUp> {
  const title = requiredString(input.title, "title", "Follow-up task", { max: 160 });
  const dueAt = assertDueDate(input.dueAt);
  const orderId = input.orderId?.trim() || null;
  const customerId = input.customerId?.trim() || null;

  if (!orderId && !customerId) {
    throw new ValidationError([
      { field: "orderId", message: "Link the follow-up to an order or a customer." },
    ]);
  }
  if (orderId && !(await getOrderDetail(sellerId, orderId))) {
    throw new ValidationError([{ field: "orderId", message: "Order not found." }]);
  }
  if (customerId && !(await getCustomer(sellerId, customerId))) {
    throw new ValidationError([{ field: "customerId", message: "Customer not found." }]);
  }

  const id = newId();
  await (await getDb())
    .prepare(
      `INSERT INTO follow_ups (id, seller_id, order_id, customer_id, title, notes, due_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
    .run(id, sellerId, orderId, customerId, title, input.notes?.trim() || null, dueAt, nowIso());

  const created = await (await getDb())
    .prepare("SELECT * FROM follow_ups WHERE id = ? AND seller_id = ?")
    .get(id, sellerId);
  return plainRow<FollowUp>(created)!;
}

export async function completeFollowUp(
  sellerId: string,
  followUpId: string,
): Promise<void> {
  const result = await (await getDb())
    .prepare(
      "UPDATE follow_ups SET status = 'done', completed_at = ? WHERE id = ? AND seller_id = ? AND status = 'open'",
    )
    .run(nowIso(), followUpId, sellerId);
  if (result.changes === 0) {
    throw new ValidationError([{ field: "id", message: "Follow-up not found or already closed." }]);
  }
}

export async function reopenFollowUp(
  sellerId: string,
  followUpId: string,
): Promise<void> {
  await (await getDb())
    .prepare(
      "UPDATE follow_ups SET status = 'open', completed_at = NULL WHERE id = ? AND seller_id = ?",
    )
    .run(followUpId, sellerId);
}

export async function cancelFollowUp(
  sellerId: string,
  followUpId: string,
): Promise<void> {
  await (await getDb())
    .prepare("UPDATE follow_ups SET status = 'cancelled' WHERE id = ? AND seller_id = ?")
    .run(followUpId, sellerId);
}

export type FollowUpStats = { open: number; overdue: number; dueToday: number };

export async function followUpStats(sellerId: string): Promise<FollowUpStats> {
  const rows = (await (await getDb())
    .prepare("SELECT due_at FROM follow_ups WHERE seller_id = ? AND status = 'open'")
    .all(sellerId)) as unknown as { due_at: string }[];

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  let overdue = 0;
  let dueToday = 0;
  for (const row of rows) {
    const due = new Date(row.due_at).getTime();
    if (due < startOfDay.getTime()) overdue += 1;
    else if (due < startOfTomorrow.getTime()) dueToday += 1;
  }

  return { open: rows.length, overdue, dueToday };
}
