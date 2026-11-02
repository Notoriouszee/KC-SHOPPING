import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "../../../lib/auth/session";
import { formatDateTime } from "../../../lib/domain/dates";
import { formatNaira } from "../../../lib/domain/money";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "../../../lib/domain/status";
import { amountDueOnline, listOrdersForBuyer } from "../../../lib/repositories/orders";
import { getShopProfile } from "../../../lib/repositories/shop";
import { ReceiptUploadForm } from "../../../components/receipt-upload-form";
import { ConfirmReceivedForm } from "../../../components/confirm-received-form";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "../../../components/ui";

export const metadata: Metadata = { title: "My orders", robots: { index: false, follow: false } };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const user = await requireCustomer();
  const params = await searchParams;
  const orders = listOrdersForBuyer(user.id);

  return (
    <div>
      <PageHeader
        title={`Hello, ${user.owner_name.split(" ")[0]}`}
        description="Your orders, and where to send payment."
        action={
          <Link href="/shops" className="btn-secondary">
            Browse shops
          </Link>
        }
      />

      {params.welcome === "1" ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Your account is ready. Find a shop you like and place your first order.
        </div>
      ) : null}

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            title="No orders yet"
            description="When you order from a shop, it will appear here with the seller's payment details and a place to upload your receipt."
            action={
              <Link href="/shops" className="btn-primary mt-2">
                Browse shops
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const shop = getShopProfile(order.seller_id);
            const due = amountDueOnline(order);
            const remaining = Math.max(0, due - order.paid_kobo);
            const paid = order.payment_status === "paid";

            return (
              <Card key={order.id}>
                <CardHeader
                  title={order.reference}
                  description={`${shop?.shop_name ?? "Shop"} · ${formatDateTime(order.created_at)}`}
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={paid ? "success" : "warn"}>
                        {PAYMENT_STATUS_LABELS[order.payment_status]}
                      </Badge>
                      <Badge tone="neutral">{ORDER_STATUS_LABELS[order.status]}</Badge>
                    </div>
                  }
                />

                <div className="space-y-4 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium text-ink-900">{order.item_summary ?? "Order"}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {order.delivery_address ?? "No delivery address given"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-semibold text-ink-900">
                        {formatNaira(order.total_kobo)}
                      </p>
                      <p className="text-xs text-ink-500">
                        {order.delivery_fee_on_delivery === 1 && order.delivery_fee_kobo > 0
                          ? `Pay ${formatNaira(due)} now + ${formatNaira(order.delivery_fee_kobo)} delivery on delivery`
                          : `${formatNaira(order.paid_kobo)} paid`}
                      </p>
                    </div>
                  </div>

                  {paid ? (
                    <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      Payment confirmed by the shop. Thank you.
                    </p>
                  ) : (
                    <>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <p className="font-semibold">
                          Transfer {formatNaira(remaining)} to confirm this order
                        </p>
                        {shop?.shop_account_number ? (
                          <div className="mt-1.5 space-y-0.5 text-[13px]">
                            <p>
                              {shop.shop_bank_name ?? "Bank"} ·{" "}
                              <span className="font-mono">{shop.shop_account_number}</span>
                            </p>
                            <p>{shop.shop_account_name ?? shop.shop_name}</p>
                          </div>
                        ) : (
                          <p className="mt-1 text-[13px]">
                            This shop has not added account details yet — message them to arrange
                            payment.
                          </p>
                        )}
                        {order.delivery_fee_on_delivery === 1 && order.delivery_fee_kobo > 0 ? (
                          <p className="mt-1.5 text-[13px]">
                            Delivery of {formatNaira(order.delivery_fee_kobo)} is paid on delivery.
                          </p>
                        ) : null}
                        <p className="mt-1.5 text-[13px]">
                          Use <strong>{order.reference}</strong> as the transfer description.
                        </p>
                      </div>

                      {order.receipt_url ? (
                        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={order.receipt_url}
                            alt="Your uploaded receipt"
                            className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                          />
                          <p className="text-xs text-ink-500">
                            Receipt sent. Waiting for {shop?.shop_name ?? "the shop"} to confirm.
                          </p>
                        </div>
                      ) : null}

                      <details className="rounded-xl border border-slate-200 px-3 py-2">
                        <summary className="cursor-pointer text-sm font-medium text-ink-700">
                          {order.receipt_url ? "Replace receipt" : "I have paid — upload receipt"}
                        </summary>
                        <div className="pt-3">
                          <ReceiptUploadForm
                            orderId={order.id}
                            existingReceiptUrl={order.receipt_url}
                            compact
                          />
                        </div>
                      </details>
                    </>
                  )}

                  <div className="rounded-xl border border-slate-200 px-3 py-3">
                    <p className="mb-2 text-sm font-semibold text-ink-900">Delivery</p>
                    <ConfirmReceivedForm
                      orderId={order.id}
                      alreadyConfirmedAt={order.received_confirmed_at}
                      confirmedLabel={`You confirmed delivery on ${formatDateTime(order.received_confirmed_at)}.`}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
