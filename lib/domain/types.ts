import type { OrderSource, OrderStatus, PaymentStatus } from "./status";

export type AccountType = "seller" | "customer";

export type User = {
  id: string;
  email: string;
  password_hash: string;
  owner_name: string;
  business_name: string;
  phone: string | null;
  role: "seller" | "admin";
  /** What kind of account this is; customers never get a shop. */
  account_type: AccountType;
  created_at: string;
  updated_at: string;
};

export type Customer = {
  id: string;
  seller_id: string;
  name: string;
  phone: string;
  alt_phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: string;
  seller_id: string;
  customer_id: string;
  reference: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal_kobo: number;
  delivery_fee_kobo: number;
  total_kobo: number;
  paid_kobo: number;
  delivery_address: string | null;
  notes: string | null;
  source: OrderSource;
  /** The product a shared link pointed at, when the order came from one. */
  product_id: string | null;
  /** Unguessable token for the customer's confirmation page; null for manual orders. */
  public_token: string | null;
  /** The signed-in customer who placed the order, when there is one. */
  buyer_user_id: string | null;
  /** Receipt the customer uploaded so the seller can verify payment. */
  receipt_url: string | null;
  receipt_note: string | null;
  receipt_amount_kobo: number | null;
  receipt_uploaded_at: string | null;
  /** 1 when the delivery fee is collected by the rider instead of transferred. */
  delivery_fee_on_delivery: number;
  /** Goods amount to transfer now; null means the full total. */
  amount_due_online_kobo: number | null;
  /** When the customer confirmed they received the order. */
  received_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  seller_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price_kobo: number;
  line_total_kobo: number;
  created_at: string;
};

export type OrderEvent = {
  id: string;
  order_id: string;
  seller_id: string;
  type: string;
  message: string;
  created_at: string;
};

export type FollowUp = {
  id: string;
  seller_id: string;
  order_id: string | null;
  customer_id: string | null;
  title: string;
  notes: string | null;
  due_at: string;
  status: "open" | "done" | "cancelled";
  completed_at: string | null;
  created_at: string;
};

export type OrderWithCustomer = Order & {
  customer_name: string;
  customer_phone: string;
  item_summary: string | null;
};

export type OrderDetail = OrderWithCustomer & {
  items: OrderItem[];
  events: OrderEvent[];
  followUps: FollowUp[];
};

export type CustomerWithStats = Customer & {
  order_count: number;
  total_spent_kobo: number;
  last_order_at: string | null;
};

/**
 * Seller shop profile. `id` is the seller's user id. Only the fields in
 * `PublicShop` may ever be rendered on a public page.
 */
export type ShopProfile = {
  id: string;
  shop_slug: string | null;
  shop_name: string | null;
  shop_description: string | null;
  shop_logo_url: string | null;
  shop_contact_phone: string | null;
  shop_slug_changed_at: string | null;
  business_name: string;
  /** Payment details shown to customers when they place an order. */
  shop_bank_name: string | null;
  shop_account_name: string | null;
  shop_account_number: string | null;
  /** Delivery is paid on delivery; this is the advertised fee. */
  shop_delivery_fee_kobo: number;
  shop_delivery_note: string | null;
};

export type PublicShop = {
  id: string;
  shop_slug: string;
  shop_name: string;
  shop_description: string | null;
  shop_logo_url: string | null;
  shop_contact_phone: string | null;
  shop_bank_name: string | null;
  shop_account_name: string | null;
  shop_account_number: string | null;
  shop_delivery_fee_kobo: number;
  shop_delivery_note: string | null;
};

/** A shop as shown on the public marketplace listing. */
export type MarketplaceShop = PublicShop & { product_count: number };

export type Product = {
  id: string;
  seller_id: string;
  name: string;
  slug: string;
  description: string | null;
  price_kobo: number;
  publication_status: "draft" | "published";
  availability: "available" | "out_of_stock";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductImage = {
  id: string;
  product_id: string;
  seller_id: string;
  url: string;
  alt: string | null;
  position: number;
  /** Pixel size measured at upload, used for og:image:width/height. */
  width: number | null;
  height: number | null;
  created_at: string;
};

export type ProductWithImages = Product & { images: ProductImage[] };

/** What a public product page needs: the product, its photos and its shop. */
export type PublicProduct = ProductWithImages & { shop: PublicShop };

/**
 * What a customer's own confirmation page may show. It deliberately excludes the
 * customer's personal details and the seller's account data: the token is
 * unguessable, but there is no reason to display more than the order facts.
 */
export type PublicOrderView = {
  order_id: string;
  reference: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_kobo: number;
  amount_due_online_kobo: number;
  delivery_fee_kobo: number;
  delivery_fee_on_delivery: number;
  receipt_url: string | null;
  received_confirmed_at: string | null;
  created_at: string;
  shop_name: string;
  shop_slug: string;
  shop_phone: string | null;
  shop_bank_name: string | null;
  shop_account_name: string | null;
  shop_account_number: string | null;
  product_name: string;
  quantity: number;
  unit_price_kobo: number;
};
