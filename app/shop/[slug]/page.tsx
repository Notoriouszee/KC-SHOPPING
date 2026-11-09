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
import { ProductGrid } from "../../../components/product-grid";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getPublicShop(slug);

  if (!shop) {
    return { title: "Shop not found", robots: { index: false, follow: false } };
  }

  return buildShopMetadata(shop);
}

export default async function PublicShopPage({ params }: Props) {
  const { slug } = await params;
  const shop = await getPublicShop(slug);

  if (!shop) {
    const redirect = await resolveRetiredSlug(slug);
    if (redirect) permanentRedirect(`/shop/${redirect.current_slug}`);
    notFound();
  }

  const user = await getCurrentUser();
  const initial = shop.shop_name.slice(0, 1).toUpperCase();
  const products = await listPublishedProducts(shop.id);

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

        <section className="mx-auto max-w-[1320px] px-4 py-12 sm:px-6">
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
            <div className="mt-6">
              <ProductGrid
                products={products.map((product) => ({
                  id: product.id,
                  name: product.name,
                  slug: product.slug,
                  price_kobo: product.price_kobo,
                  shop_slug: shop.shop_slug,
                  shop_name: shop.shop_name,
                  cover_url: product.images[0]?.url ?? null,
                  availability: product.availability,
                }))}
                showShop={false}
                priorityCount={4}
              />
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}