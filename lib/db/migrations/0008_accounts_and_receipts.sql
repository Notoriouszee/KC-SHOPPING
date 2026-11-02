-- Seller/customer accounts, seller payment details, payment receipts, and
-- delivery-fee-paid-on-delivery.
--
-- Existing accounts are sellers, so the default for account_type is 'seller'.
-- Customers never get a shop slug and cannot reach seller screens.

ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'seller'
  CHECK (account_type IN ('seller', 'customer'));

-- Where customers should send payment. Shown on the order page.
ALTER TABLE users ADD COLUMN shop_bank_name TEXT;
ALTER TABLE users ADD COLUMN shop_account_name TEXT;
ALTER TABLE users ADD COLUMN shop_account_number TEXT;

-- Delivery is paid on delivery, so the seller advertises the fee rather than
-- adding it to the money the customer transfers now.
ALTER TABLE users ADD COLUMN shop_delivery_fee_kobo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN shop_delivery_note TEXT;

-- Orders placed by a signed-in customer link back to that account so the
-- customer can track them and upload a receipt.
ALTER TABLE orders ADD COLUMN buyer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Payment receipt uploaded by the customer for the seller to verify.
ALTER TABLE orders ADD COLUMN receipt_url TEXT;
ALTER TABLE orders ADD COLUMN receipt_note TEXT;
ALTER TABLE orders ADD COLUMN receipt_amount_kobo INTEGER;
ALTER TABLE orders ADD COLUMN receipt_uploaded_at TEXT;

-- 1 when the delivery fee is collected by the rider instead of transferred.
ALTER TABLE orders ADD COLUMN delivery_fee_on_delivery INTEGER NOT NULL DEFAULT 0;

-- Money the customer must transfer now (goods only when delivery is on delivery).
-- NULL means "same as total_kobo", which keeps older orders working.
ALTER TABLE orders ADD COLUMN amount_due_online_kobo INTEGER;

CREATE INDEX orders_buyer_idx ON orders (buyer_user_id, created_at DESC);
