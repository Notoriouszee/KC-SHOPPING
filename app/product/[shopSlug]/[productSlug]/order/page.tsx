import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandLockup } from "../../../../../components/brand";
import { PublicOrderForm } from "../../../../../components/public-order-form";
import { requireCustomer } from "../../../../../lib/auth/session";
import { formatNaira } from "../../../../../lib/domain/money";
import { getPublicProduct } from "../../../../../lib/repositories/products";

type Props = { params: Promise<{ shopSlug: string; productSlug: string }> };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Place your order",
  robots: { index: false, follow: false },
};

export default async function PublicOrderPage({ params }: Props) {
  const { shopSlug, productSlug } = await params;
  const product = await getPublicProduct(shopSlug, productSlug);

  if (!product) notFound();

  // Browsing is free; ordering needs a customer account.
  const user = await requireCustomer(`/product/${shopSlug}/${productSlug}/order`);

  const cover = product.images[0];
  const available = product.availability === "available";
  const deliveryFee = product.shop.shop_delivery_fee_kobo ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href={`/product/${product.shop.shop_slug}/${product.slug}`}
            className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-700 hover:text-ink-900"
          >
            <span aria-hidden="true" className="text-ink-400">
              ←
            </span>
            <span className="truncate">Back to product</span>
          </Link>
          <Link href="/" className="shrink-0 opacity-80">
            <BrandLockup />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-6">
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">Place your order</h1>
        <p className="mt-1 text-sm text-ink-500">
          Signed in as {user.owner_name}. {product.shop.shop_name} will confirm and arrange delivery.
        </p>

        <section className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-900">{product.name}</p>
            <p className="text-sm font-semibold text-brand-700">
              {formatNaira(product.price_kobo)}
            </p>
            <p className="text-xs text-ink-500">
              {available ? "Available" : "Out of stock"} · {product.shop.shop_name}
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-surface p-4 sm:p-5">
          {available ? (
            <>
              <PublicOrderForm
                shopSlug={product.shop.shop_slug}
                productSlug={product.slug}
                productName={product.name}
                priceKobo={product.price_kobo}
                deliveryFeeKobo={deliveryFee}
                defaultName={user.owner_name}
                defaultPhone={user.phone ?? ""}
              />

              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">How payment works</p>
                {product.shop.shop_account_number ? (
                  <div className="mt-1.5 space-y-0.5 text-[13px]">
                    <p>Transfer the goods total to:</p>
                    <p className="font-medium">
                      {product.shop.shop_bank_name ?? "Bank"} ·{" "}
                      <span className="font-mono">{product.shop.shop_account_number}</span>
                    </p>
                    <p>{product.shop.shop_account_name ?? product.shop.shop_name}</p>
                  </div>
                ) : (
                  <p className="mt-1 text-[13px]">
                    {product.shop.shop_name} has not added account details yet. After ordering you
                    will see their contact details to arrange payment.
                  </p>
                )}
                <p className="mt-2 text-[13px]">
                  After ordering, upload your transfer receipt so the shop can confirm.
                  {deliveryFee > 0
                    ? ` Delivery of ${formatNaira(deliveryFee)} is paid on delivery.`
                    : " Delivery is arranged directly with the shop."}
                </p>
              </div>
            </>
          ) : (
            <div className="py-4 text-center">
              <p className="text-base font-semibold text-ink-900">This product is out of stock</p>
              <p className="mt-1 text-sm text-ink-500">
                You cannot order it right now. Message {product.shop.shop_name} to ask when it is
                back.
              </p>
              <Link
                href={`/product/${product.shop.shop_slug}/${product.slug}`}
                className="btn-secondary mt-4"
              >
                Back to product
              </Link>
            </div>
          )}
        </section>

        <footer className="mt-8 text-center text-xs text-ink-500">
          <p>
            {product.shop.shop_name} runs on{" "}
            <Link href="/" className="font-semibold text-brand-700 hover:underline">
              K&C Shopping
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
