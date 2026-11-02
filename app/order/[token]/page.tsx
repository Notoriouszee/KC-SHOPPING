import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandLockup } from "../../../components/brand";
import { CopyButton } from "../../../components/copy-button";
import { ReceiptUploadForm } from "../../../components/receipt-upload-form";
import { ConfirmReceivedForm } from "../../../components/confirm-received-form";
import { getCurrentUser } from "../../../lib/auth/session";
import { formatDateTime } from "../../../lib/domain/dates";
import { formatNaira } from "../../../lib/domain/money";
import { whatsappUrl } from "../../../lib/domain/phone";
import { getPublicOrderByToken } from "../../../lib/repositories/public-orders";

type Props = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order confirmation",
  robots: { index: false, follow: false },
};

export default async function OrderConfirmationPage({ params }: Props) {
  const { token } = await params;
  const order = getPublicOrderByToken(token);

  if (!order) notFound();

  const user = await getCurrentUser();
  const paid = order.payment_status === "paid";
  const deliveryOnDelivery = order.delivery_fee_on_delivery === 1 && order.delivery_fee_kobo > 0;

  const message =
    `Hi ${order.shop_name}, I just placed an order on K&C Shopping.\n` +
    `Reference: ${order.reference}\n` +
    `Item: ${order.product_name} × ${order.quantity}\n` +
    `Amount to pay: ${formatNaira(order.amount_due_online_kobo)}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Order confirmation
          </span>
          <Link href="/" className="opacity-80">
            <BrandLockup />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-700"
          >
            ✓
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink-900">Order sent</h1>
            <p className="text-sm text-ink-500">
              {order.shop_name} has received your order and will contact you to confirm.
            </p>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                Your reference
              </p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-ink-900">
                {order.reference}
              </p>
            </div>
            <CopyButton value={order.reference} label="Copy reference" />
          </div>

          <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-ink-500">Item</dt>
              <dd className="text-right font-medium text-ink-900">
                {order.product_name} × {order.quantity}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-ink-500">Goods</dt>
              <dd className="text-right text-ink-700">
                {formatNaira(order.amount_due_online_kobo)}
              </dd>
            </div>
            {deliveryOnDelivery ? (
              <div className="flex items-start justify-between gap-4">
                <dt className="text-ink-500">Delivery (paid on delivery)</dt>
                <dd className="text-right text-ink-700">{formatNaira(order.delivery_fee_kobo)}</dd>
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-4 border-t border-slate-100 pt-2">
              <dt className="font-semibold text-ink-900">Total order value</dt>
              <dd className="text-right text-base font-semibold text-ink-900">
                {formatNaira(order.total_kobo)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-ink-500">Placed</dt>
              <dd className="text-right text-ink-700">{formatDateTime(order.created_at)}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-ink-500">Payment</dt>
              <dd className={`text-right ${paid ? "text-emerald-700" : "text-amber-700"}`}>
                {paid ? "Confirmed by the shop" : "Not confirmed yet"}
              </dd>
            </div>
          </dl>
        </section>

        {paid ? (
          <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-semibold">Payment confirmed</p>
            <p className="mt-1">
              {order.shop_name} has confirmed your payment. They will arrange delivery with you.
            </p>
          </section>
        ) : (
          <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <p className="text-base font-semibold">
              Pay {formatNaira(order.amount_due_online_kobo)} to confirm
            </p>
            {order.shop_account_number ? (
              <div className="mt-2 space-y-0.5">
                <p>
                  {order.shop_bank_name ?? "Bank"} ·{" "}
                  <span className="font-mono font-semibold">{order.shop_account_number}</span>
                </p>
                <p>{order.shop_account_name ?? order.shop_name}</p>
              </div>
            ) : (
              <p className="mt-2">
                This shop has not added bank details yet — message them on WhatsApp to arrange
                payment.
              </p>
            )}
            <p className="mt-2">
              Use <strong>{order.reference}</strong> as the transfer description.
            </p>
            {deliveryOnDelivery ? (
              <p className="mt-1">
                Delivery of {formatNaira(order.delivery_fee_kobo)} is paid when your order arrives.
              </p>
            ) : null}
          </section>
        )}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink-900">
            {order.receipt_url ? "Replace your payment receipt" : "Upload your payment receipt"}
          </h2>
          <p className="mb-3 mt-1 text-xs text-ink-500">
            Screenshot your bank transfer and send it here so {order.shop_name} can confirm your
            order.
          </p>
          <ReceiptUploadForm
            orderId={order.order_id}
            token={token}
            existingReceiptUrl={order.receipt_url}
            compact
          />
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink-900">Delivery</h2>
          <p className="mb-3 mt-1 text-xs text-ink-500">
            Once the item is in your hands, confirm it here — {order.shop_name} and the platform both
            see it, which settles any dispute.
          </p>
          <ConfirmReceivedForm token={token} alreadyConfirmedAt={order.received_confirmed_at} />
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-surface px-4 py-3 text-sm text-ink-600">
          <p className="font-semibold text-ink-900">Keep this link</p>
          <p className="mt-1">
            Bookmark this page — it is how you return to your order and upload a receipt.{" "}
            {user?.account_type === "customer" ? (
              <Link href="/account" className="font-semibold text-brand-700 hover:underline">
                It is also in your account.
              </Link>
            ) : (
              <Link href="/login" className="font-semibold text-brand-700 hover:underline">
                Create an account to track all your orders.
              </Link>
            )}
          </p>
        </section>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {order.shop_phone ? (
            <a
              href={whatsappUrl(order.shop_phone, message)}
              target="_blank"
              rel="noreferrer"
              className="btn-primary flex-1 text-center"
            >
              Message {order.shop_name} on WhatsApp
            </a>
          ) : null}
          <Link href={`/shop/${order.shop_slug}`} className="btn-secondary flex-1 text-center">
            Back to shop
          </Link>
        </div>
      </main>
    </div>
  );
}
