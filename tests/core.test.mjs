/**
 * Core MVP tests: money maths, auth, tenancy isolation, order lifecycle,
 * payments and follow-ups. Runs against a throwaway SQLite file.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";

const { signUp, authenticate, findUserByEmail } = await import("../lib/auth/users.ts");
const { hashPassword, verifyPassword } = await import("../lib/auth/password.ts");
const { formatNaira, parseNairaToKobo, lineTotal } = await import("../lib/domain/money.ts");
const { derivePaymentStatus } = await import("../lib/domain/status.ts");
const { normalisePhone } = await import("../lib/domain/validation.ts");
const { createCustomer, listCustomers, findOrCreateCustomer, getCustomer } = await import(
  "../lib/repositories/customers.ts"
);
const { createOrder, getOrderDetail, listOrders, recordPayment, updateOrderStatus, orderStats } =
  await import("../lib/repositories/orders.ts");
const { createFollowUp, completeFollowUp, followUpStats, listFollowUps } = await import(
  "../lib/repositories/followups.ts"
);

let sellerA;
let sellerB;
let customerA;

before(async () => {
  // Each suite owns its database. The environment is set here rather than at
  const a = await signUp({
    email: "a@shop.ng",
    password: "password123",
    ownerName: "Ada",
    businessName: "Ada Shop",
    phone: "08011111111",
  });
  if ("error" in a) throw new Error(a.error);
  sellerA = a.user;

  const b = await signUp({
    email: "b@shop.ng",
    password: "password123",
    ownerName: "Bayo",
    businessName: "Bayo Store",
    phone: "08022222222",
  });
  if ("error" in b) throw new Error(b.error);
  sellerB = b.user;

  customerA = await createCustomer(sellerA.id, {
    name: "Chinedu Eze",
    phone: "0803 123 4567",
    address: "12 Admiralty Way, Lekki",
  });
});

test("money formatting and parsing", () => {
  assert.equal(formatNaira(4500000), "₦45,000");
  assert.equal(formatNaira(125050), "₦1,250.50");
  assert.equal(formatNaira(0), "₦0");
  assert.equal(parseNairaToKobo("45,000"), 4500000);
  assert.equal(parseNairaToKobo("₦1,250.50"), 125050);
  assert.equal(parseNairaToKobo("12500"), 1250000);
  assert.equal(parseNairaToKobo("abc"), null);
  assert.equal(parseNairaToKobo("-5"), null);
  assert.equal(parseNairaToKobo(""), null);
  assert.equal(lineTotal(125050, 3), 375150);
});

test("payment status is derived, never assumed", () => {
  assert.equal(derivePaymentStatus(100000, 0), "unpaid");
  assert.equal(derivePaymentStatus(100000, 40000), "partial");
  assert.equal(derivePaymentStatus(100000, 100000), "paid");
});

test("phone numbers are normalised to a local format", () => {
  assert.equal(normalisePhone("0803 123 4567"), "08031234567");
  assert.equal(normalisePhone("+2348031234567"), "08031234567");
  assert.equal(normalisePhone("2348031234567"), "08031234567");
  assert.equal(normalisePhone("8031234567"), "08031234567");
  assert.equal(normalisePhone("nonsense"), null);
});

test("passwords hash and verify", async () => {
  const stored = await hashPassword("hunter2hunter2");
  assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(await verifyPassword("hunter2hunter2", stored), true);
  assert.equal(await verifyPassword("wrong-password", stored), false);
});

test("sign up rejects duplicate emails and signs in correctly", async () => {
  const duplicate = await signUp({
    email: "A@shop.ng",
    password: "password123",
    ownerName: "Copy",
    businessName: "Copy Shop",
  });
  assert.ok("error" in duplicate);

  const session = await authenticate("a@shop.ng", "password123");
  assert.equal(session?.user.id, sellerA.id);
  assert.equal(await authenticate("a@shop.ng", "wrong"), null);
  assert.equal((await findUserByEmail("a@shop.ng")).business_name, "Ada Shop");
});

test("customers are scoped to their seller and phones are unique per seller", async () => {
  assert.equal(customerA.phone, "08031234567");
  await assert.rejects(async () => {
    await createCustomer(sellerA.id, { name: "Duplicate", phone: "08031234567" });
  });
  // Same phone under a different seller is a different customer.
  const other = await createCustomer(sellerB.id, { name: "Chinedu (B)", phone: "08031234567" });
  assert.notEqual(other.id, customerA.id);

  assert.equal(await getCustomer(sellerB.id, customerA.id), null);
  assert.equal((await listCustomers(sellerB.id)).length, 1);
});

test("orders compute totals, stay unpaid and get a readable reference", async () => {
  const order = await createOrder(sellerA.id, {
    customer: { id: customerA.id, name: customerA.name, phone: customerA.phone },
    items: [
      { description: "Black designer bag", quantity: 2, unitPriceKobo: 4500000 },
      { description: "Silk scarf", quantity: 1, unitPriceKobo: 900000 },
    ],
    deliveryFeeKobo: 250000,
    source: "manual",
  });

  assert.match(order.reference, /^OP-[0-9A-HJKMNP-TV-Z]{6}$/);
  assert.equal(order.subtotal_kobo, 9900000);
  assert.equal(order.delivery_fee_kobo, 250000);
  assert.equal(order.total_kobo, 10150000);
  assert.equal(order.paid_kobo, 0);
  assert.equal(order.payment_status, "unpaid");
  assert.equal(order.status, "new");
  assert.equal(order.items.length, 2);
  assert.equal(order.events.at(-1).type, "created");
});

test("order input is validated", async () => {
  await assert.rejects(
    async () => {
      await createOrder(sellerA.id, {
        customer: { id: customerA.id, name: "x", phone: "08031234567" },
        items: [],
      });
    },
    /at least one item/i,
  );

  await assert.rejects(
    async () => {
      await createOrder(sellerA.id, {
        customer: { id: customerA.id, name: "x", phone: "08031234567" },
        items: [{ description: "Bag", quantity: 0, unitPriceKobo: 100 }],
      });
    },
    /whole number/i,
  );

  await assert.rejects(
    async () => {
      await createOrder(sellerA.id, {
        customer: { id: "does-not-exist", name: "x", phone: "08031234567" },
        items: [{ description: "Bag", quantity: 1, unitPriceKobo: 100 }],
      });
    },
    /customer not found/i,
  );
});

test("payments move an order from unpaid to part paid to paid", async () => {
  const order = await createOrder(sellerA.id, {
    customer: { id: customerA.id, name: customerA.name, phone: customerA.phone },
    items: [{ description: "Leather sandals", quantity: 1, unitPriceKobo: 1250000 }],
  });

  const partial = await recordPayment(sellerA.id, order.id, 500000);
  assert.equal(partial.paid_kobo, 500000);
  assert.equal(partial.payment_status, "partial");

  const settled = await recordPayment(sellerA.id, order.id, 1000000);
  assert.equal(settled.paid_kobo, 1250000);
  assert.equal(settled.payment_status, "paid");

  // Overpayment is clamped rather than inflating the order total.
  await assert.rejects(async () => {
    await recordPayment(sellerA.id, order.id, 5000);
  }, /already fully paid/i);
});

test("order status follows the allowed transitions", async () => {
  const order = await createOrder(sellerA.id, {
    customer: { id: customerA.id, name: customerA.name, phone: customerA.phone },
    items: [{ description: "Kaftan", quantity: 1, unitPriceKobo: 3200000 }],
  });

  await assert.rejects(async () => {
    await updateOrderStatus(sellerA.id, order.id, "delivered");
  }, /cannot move to/i);

  const confirmed = await updateOrderStatus(sellerA.id, order.id, "confirmed");
  assert.equal(confirmed.status, "confirmed");

  const cancelled = await updateOrderStatus(sellerA.id, order.id, "cancelled");
  assert.equal(cancelled.status, "cancelled");
  await assert.rejects(async () => {
    await updateOrderStatus(sellerA.id, order.id, "processing");
  }, /cannot move to/i);
});

test("one seller can never read or mutate another seller's order", async () => {
  const order = await createOrder(sellerA.id, {
    customer: { id: customerA.id, name: customerA.name, phone: customerA.phone },
    items: [{ description: "Private order", quantity: 1, unitPriceKobo: 100000 }],
  });

  // Reading through the wrong seller returns nothing at all.
  assert.equal(await getOrderDetail(sellerB.id, order.id), null);
  assert.equal(
    (await listOrders(sellerB.id)).some((row) => row.id === order.id),
    false,
  );

  // Mutations are rejected just like an RLS policy would.
  await assert.rejects(async () => {
    await updateOrderStatus(sellerB.id, order.id, "confirmed");
  }, /not found/i);
  await assert.rejects(async () => {
    await recordPayment(sellerB.id, order.id, 1000);
  }, /not found/i);

  // Stats are per seller too.
  assert.equal((await orderStats(sellerB.id)).totalOrders, 0);
});

test("order filters and search stay inside the seller's data", async () => {
  const open = await listOrders(sellerA.id, { status: "open" });
  assert.ok(open.every((order) => order.status !== "delivered" && order.status !== "cancelled"));

  const byReference = await listOrders(sellerA.id, { query: open[0].reference });
  assert.equal(byReference.length, 1);
  assert.equal(byReference[0].id, open[0].id);

  assert.equal((await listOrders(sellerA.id, { query: "nothing-matches-this" })).length, 0);
});

test("repeat orders reuse the customer record instead of duplicating it", async () => {
  const before = (await listCustomers(sellerA.id)).length;
  const reused = await findOrCreateCustomer(sellerA.id, {
    name: "Chinedu Eze",
    phone: "08031234567",
    address: "New address that must not overwrite the curated one",
  });
  assert.equal(reused.id, customerA.id);
  assert.equal((await listCustomers(sellerA.id)).length, before);
  // Existing curated address is preserved.
  assert.equal(reused.address, "12 Admiralty Way, Lekki");
});

test("follow-ups attach to the right seller and complete cleanly", async () => {
  const order = (await listOrders(sellerA.id))[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const followUp = await createFollowUp(sellerA.id, {
    title: "Confirm delivery",
    dueAt: yesterday.toISOString(),
    orderId: order.id,
  });

  assert.equal(followUp.status, "open");
  assert.ok((await followUpStats(sellerA.id)).overdue >= 1);

  await completeFollowUp(sellerA.id, followUp.id);
  assert.equal((await listFollowUps(sellerA.id, { status: "done" })).some((f) => f.id === followUp.id), true);
  await assert.rejects(async () => {
    await completeFollowUp(sellerA.id, followUp.id);
  }, /not found or already closed/i);

  // Overdue count drops once the item is completed.
  assert.equal(
    (await listFollowUps(sellerA.id, { status: "open" })).some((f) => f.id === followUp.id),
    false,
  );

  // Another seller cannot complete it.
  const other = await createFollowUp(sellerA.id, {
    title: "x",
    dueAt: new Date().toISOString(),
    orderId: order.id,
  });
  await assert.rejects(async () => {
    await completeFollowUp(sellerB.id, other.id);
  }, /not found/i);
});
