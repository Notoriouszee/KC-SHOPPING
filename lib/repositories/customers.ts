import { getDb, nowIso, plainRow, plainRows } from "../db";
import { newId } from "../domain/ids";
import type { Customer, CustomerWithStats } from "../domain/types";
import { ValidationError, normalisePhone, requirePhone, requiredString } from "../domain/validation";

export type CustomerInput = {
  name: string;
  phone: string;
  altPhone?: string | null;
  address?: string | null;
  notes?: string | null;
};

export type CustomerFilters = { query?: string; limit?: number };

/**
 * Lists customers for one seller. `sellerId` is always the first argument and
 * always applied to the query — the local stand-in for an RLS `auth.uid()` check.
 */
export function listCustomers(sellerId: string, filters: CustomerFilters = {}): CustomerWithStats[] {
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const query = filters.query?.trim();

  const rows = getDb()
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.seller_id = c.seller_id) AS order_count,
              (SELECT COALESCE(SUM(o.total_kobo), 0) FROM orders o
                 WHERE o.customer_id = c.id AND o.seller_id = c.seller_id AND o.payment_status = 'paid') AS total_spent_kobo,
              (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id AND o.seller_id = c.seller_id) AS last_order_at
       FROM customers c
       WHERE c.seller_id = ?
         AND (? IS NULL OR c.name LIKE ? OR c.phone LIKE ?)
       ORDER BY c.created_at DESC
       LIMIT ?`,
    )
    .all(sellerId, query ?? null, `%${query ?? ""}%`, `%${query ?? ""}%`, limit);

  return plainRows<CustomerWithStats>(rows);
}

export function getCustomer(sellerId: string, customerId: string): Customer | null {
  const row = getDb()
    .prepare("SELECT * FROM customers WHERE id = ? AND seller_id = ?")
    .get(customerId, sellerId);
  return plainRow<Customer>(row);
}

export function findCustomerByPhone(sellerId: string, phone: string): Customer | null {
  const normalised = normalisePhone(phone);
  if (!normalised) return null;
  const row = getDb()
    .prepare("SELECT * FROM customers WHERE seller_id = ? AND phone = ?")
    .get(sellerId, normalised);
  return plainRow<Customer>(row);
}

export function createCustomer(sellerId: string, input: CustomerInput): Customer {
  const name = requiredString(input.name, "name", "Customer name", { max: 120 });
  const phone = requirePhone(input.phone);

  const existing = findCustomerByPhone(sellerId, phone);
  if (existing) {
    throw new ValidationError([
      { field: "phone", message: `That phone number is already saved as ${existing.name}.` },
    ]);
  }

  const id = newId();
  const timestamp = nowIso();
  getDb()
    .prepare(
      `INSERT INTO customers (id, seller_id, name, phone, alt_phone, address, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      sellerId,
      name,
      phone,
      input.altPhone?.trim() || null,
      input.address?.trim() || null,
      input.notes?.trim() || null,
      timestamp,
      timestamp,
    );

  const created = getCustomer(sellerId, id);
  if (!created) throw new Error("Customer could not be created.");
  return created;
}

export function updateCustomer(sellerId: string, customerId: string, input: CustomerInput): Customer {
  const existing = getCustomer(sellerId, customerId);
  if (!existing) throw new ValidationError([{ field: "id", message: "Customer not found." }]);

  const name = requiredString(input.name, "name", "Customer name", { max: 120 });
  const phone = requirePhone(input.phone);

  const duplicate = findCustomerByPhone(sellerId, phone);
  if (duplicate && duplicate.id !== customerId) {
    throw new ValidationError([
      { field: "phone", message: `That phone number is already saved as ${duplicate.name}.` },
    ]);
  }

  getDb()
    .prepare(
      `UPDATE customers SET name = ?, phone = ?, alt_phone = ?, address = ?, notes = ?, updated_at = ?
       WHERE id = ? AND seller_id = ?`,
    )
    .run(
      name,
      phone,
      input.altPhone?.trim() || null,
      input.address?.trim() || null,
      input.notes?.trim() || null,
      nowIso(),
      customerId,
      sellerId,
    );

  const updated = getCustomer(sellerId, customerId);
  if (!updated) throw new Error("Customer could not be updated.");
  return updated;
}

/**
 * Reuses an existing customer record when the phone number matches, so repeat
 * customers do not fragment across orders. Only fills in blanks on the existing
 * record; never overwrites what the seller already curated.
 */
export function findOrCreateCustomer(
  sellerId: string,
  input: { name: string; phone: string; address?: string | null },
): Customer {
  const phone = requirePhone(input.phone);
  const existing = findCustomerByPhone(sellerId, phone);
  if (existing) {
    const updates: string[] = [];
    const values: (string | null)[] = [];
    if (!existing.address && input.address) {
      updates.push("address = ?");
      values.push(input.address.trim());
    }
    if (!existing.name && input.name) {
      updates.push("name = ?");
      values.push(input.name.trim());
    }
    if (updates.length > 0) {
      values.push(nowIso(), existing.id, sellerId);
      getDb()
        .prepare(
          `UPDATE customers SET ${updates.join(", ")}, updated_at = ? WHERE id = ? AND seller_id = ?`,
        )
        .run(...values);
      return getCustomer(sellerId, existing.id) ?? existing;
    }
    return existing;
  }

  return createCustomer(sellerId, {
    name: input.name,
    phone,
    address: input.address ?? null,
  });
}
