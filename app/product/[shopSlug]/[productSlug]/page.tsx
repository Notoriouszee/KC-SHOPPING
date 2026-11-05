import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { BrandLockup } from "../../../../components/brand";
import { ProductViewTracker } from "../../../../components/product-view-tracker";
import { ShareProductButton } from "../../../../components/share-product-button";
import { appUrl, productUrl } from "../../../../lib/config";
import { formatNaira } from "../../../../lib/domain/money";
import { whatsappUrl } from "../../../../lib/domain/phone";
import { getPublicProduct } from "../../../../lib/repositories/products";
import { resolveRetiredSlug } from "../../../../lib/repositories/shop";
import { buildProductMetadata, productJsonLd } from "../../../../lib/seo";

type Props = {
  params: Promise<{ shopSlug: string; productSlug: string }>;
  searchParams: Promise<{ src?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shopSlug, productSlug } = await params;
  const product = await getPublicProduct(shopSlug, productSlug);

  if (!product) {
    // Never index a missing or unpublished product.
    return { title: "Product not found", robots: { index: false, follow: false } };
  }

  return buildProductMetadata(product);
}

export default async function PublicProductPage({ params, searchParams }: Props) {
  const { shopSlug, productSlug } = await params;
  const { src } = await searchParams;
  const product = await getPublicProduct(shopSlug, productSlug);

  if (!product) {
    // Keep old product links working when the seller renamed their shop link.
    const redirect = await resolveRetiredSlug(shopSlug);
    if (redirect) permanentRedirect(`/product/${redirect.current_slug}/${productSlug}`);
    notFound();
  }

  const { shop } = product;
  const cover = product.images[0];
  const otherImages = product.images.slice(1);
  const available = product.availability === "available";
  const shareLink = productUrl(shop.shop_slug, product.slug, appUrl());

  const enquiry = whatsappUrl(
    shop.shop_contact_phone ?? "",
    `Hi ${shop.shop_name}, I'd like to order ${product.name} (${formatNaira(product.price_kobo)}). ${shareLink}`,
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-24 sm:pb-0">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href={`/shop/${shop.shop_slug}`}
            className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-700 hover:text-ink-900"
          >
            <span className="text-ink-400" aria-hidden="true">
              ←
            </span>
            <span className="truncate">{shop.shop_name}</span>
          </Link>
          <Link href="/" className="shrink-0 opacity-80 transition-opacity hover:opacity-100">
            <BrandLockup />
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4">
        {/* Counts a real visit (not a crawler or a prefetch) for the seller. */}
        <ProductViewTracker productId={product.id} src={src ?? null} />

        {/* Structured data for search engines, rendered on the server. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: productJsonLd(product) }}
        />
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-surface">
          <div className="aspect-square w-full bg-slate-100 sm:aspect-[4/3]">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                No photo yet
              </div>
            )}
          </div>

          {otherImages.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto p-3">
              {otherImages.map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.id}
                  src={image.url}
                  alt={`${product.name} photo`}
                  className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 object-cover"
                />
              ))}
            </div>
          ) : null}
        </div>

        <section className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            {available ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Available
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                Out of stock
              </span>
            )}
          </div>

          <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink-900">
            {product.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <p className="text-2xl font-semibold text-brand-700">
              {formatNaira(product.price_kobo)}
            </p>
            <ShareProductButton
              variant="secondary"
              label="Share product"
              product={{
                name: product.name,
                priceLabel: formatNaira(product.price_kobo),
                url: shareLink,
                imageUrl: cover?.url ?? null,
                shopName: shop.shop_name,
                description: product.description,
                available,
              }}
            />
          </div>

          {product.description ? (
            <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink-700">
              {product.description}
            </p>
          ) : null}
        </section>

        <section className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-surface px-4 py-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
            {shop.shop_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.shop_logo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-base font-semibold text-slate-400" aria-hidden="true">
                {shop.shop_name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-900">{shop.shop_name}</p>
            <Link
              href={`/shop/${shop.shop_slug}`}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              View full shop
            </Link>
          </div>
        </section>

        <section className="mt-6 hidden sm:block">
          <div className="flex flex-col gap-2 sm:flex-row">
            {available ? (
              <Link
                href={`/product/${shop.shop_slug}/${product.slug}/order`}
                className="btn-primary flex-1 text-center"
              >
                Order now
              </Link>
            ) : null}
            {shop.shop_contact_phone ? (
              <a
                href={enquiry}
                target="_blank"
                rel="noreferrer"
                className={available ? "btn-secondary flex-1 text-center" : "btn-primary flex-1 text-center"}
              >
                {available ? "Ask on WhatsApp" : "Ask when it is back"}
              </a>
            ) : null}
            <Link href={`/shop/${shop.shop_slug}`} className="btn-secondary flex-1 text-center">
              See more from this shop
            </Link>
          </div>
          <p className="mt-2 text-center text-xs text-ink-500">
            No account needed and no online payment. The seller confirms your order and arranges
            payment and delivery with you.
          </p>
        </section>

        <footer className="mt-8 text-center text-xs text-ink-500">
          <p>
            {shop.shop_name} runs on{" "}
            <Link href="/" className="font-semibold text-brand-700 hover:underline">
              K&C Shopping
            </Link>
          </p>
        </footer>
      </main>

      {/* Mobile action bar: reachable with one thumb, always visible. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-surface/95 px-4 py-3 backdrop-blur sm:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-ink-900">
              {formatNaira(product.price_kobo)}
            </p>
            <p className="truncate text-xs text-ink-500">{product.name}</p>
          </div>
          {available ? (
            <Link
              href={`/product/${shop.shop_slug}/${product.slug}/order`}
              className="btn-primary shrink-0"
            >
              Order now
            </Link>
          ) : shop.shop_contact_phone ? (
            <a href={enquiry} target="_blank" rel="noreferrer" className="btn-secondary shrink-0">
              Ask
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
