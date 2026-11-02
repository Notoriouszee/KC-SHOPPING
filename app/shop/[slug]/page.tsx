import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { formatNaira } from "../../../lib/domain/money";
import { telUrl, whatsappUrl } from "../../../lib/domain/phone";
import { getCurrentUser } from "../../../lib/auth/session";
import { listPublishedProducts } from "../../../lib/repositories/products";
import { getPublicShop, resolveRetiredSlug } from "../../../lib/repositories/shop";
import { buildShopMetadata } from "../../../lib/seo";
import { PublicHeader } from "../../../components/public-header";
import { SiteFooter } from "../../../components/site-footer";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const shop = getPublicShop(slug);

  if (!shop) {
    return { title: "Shop not found", robots: { index: false, follow: false } };
  }

  return buildShopMetadata(shop);
}

export default async function PublicShopPage({ params }: Props) {
  const { slug } = await params;
  const shop = getPublicShop(slug);

  if (!shop) {
    const redirect = resolveRetiredSlug(slug);
    if (redirect) permanentRedirect(`/shop/${redirect.current_slug}`);
    notFound();
  }

  const user = await getCurrentUser();
  const initial = shop.shop_name.slice(0, 1).toUpperCase();
  const products = listPublishedProducts(shop.id);

  return (
    <div className="min-h-screen bg-black">
      <PublicHeader user={user} />

      <main>
        <section className="border-b border-line">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-4 py-12 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div className="flex items-start gap-5">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border border-white/15 bg-surface-2">
                {shop.shop_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shop.shop_logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-serif text-3xl text-white/30" aria-hidden="true">
                    {initial}
                  </span>
                )}
              </span>

              <div>
                <p className="eyebrow">K&amp;C shop</p>
                <h1 className="display mt-2 text-[32px] leading-tight text-white sm:text-[42px]">
                  {shop.shop_name}
                </h1>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/40">
                  @{shop.shop_slug} · {products.length} piece{products.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            {shop.shop_contact_phone ? (
              <div className="flex flex-wrap gap-2">
                <a
                  href={whatsappUrl(
                    shop.shop_contact_phone,
                    `Hi ${shop.shop_name}, I found your shop on K&C Shopping.`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary"
                >
                  Chat on WhatsApp
                </a>
                <a href={telUrl(shop.shop_contact_phone)} className="btn-secondary">
                  Call shop
                </a>
              </div>
            ) : null}
          </div>

          {shop.shop_description ? (
            <div className="mx-auto max-w-[1180px] px-4 pb-10 sm:px-6">
              <p className="max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-white/60">
                {shop.shop_description}
              </p>
            </div>
          ) : null}
        </section>

        <section className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6">
          <div className="flex items-end justify-between">
            <h2 className="display text-2xl text-white sm:text-3xl">The pieces</h2>
            <Link
              href="/collections"
              className="text-[11px] uppercase tracking-[0.16em] text-white/50 hover:text-white"
            >
              All collections →
            </Link>
          </div>

          {products.length === 0 ? (
            <div className="mt-8 border border-line bg-surface-2 px-6 py-14 text-center">
              <p className="font-serif text-xl text-white">Nothing published yet</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-white/50">
                {shop.shop_name} has not added pieces to this shop yet. Check back soon, or message the
                shop directly.
              </p>
            </div>
          ) : (
            <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => {
                const cover = product.images[0];
                const available = product.availability === "available";
                return (
                  <li key={product.id}>
                    <Link href={`/product/${shop.shop_slug}/${product.slug}`} className="product-card">
                      <span className="relative block aspect-[4/5] overflow-hidden bg-neutral-100">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cover.url}
                            alt={product.name}
                            className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
                            loading="lazy"
                          />
                        ) : (
                          <span className="flex h-full items-center justify-center text-xs text-neutral-400">
                            No photo
                          </span>
                        )}
                        {available ? null : (
                          <span className="absolute left-2 top-2 bg-black px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white">
                            Sold out
                          </span>
                        )}
                      </span>
                      <span className="block px-3 py-3">
                        <span className="block truncate text-[13px] font-medium text-neutral-900">
                          {product.name}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-neutral-500">
                          {formatNaira(product.price_kobo)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}