import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser } from "../lib/auth/session";
import { listPublicShops } from "../lib/repositories/shop";
import { listPublishedProducts } from "../lib/repositories/products";
import {
  discoverProducts,
  newArrivals,
  newSeed,
  popularProducts,
  recommendedProducts,
} from "../lib/repositories/discovery";
import { PublicHeader } from "../components/public-header";
import { SiteFooter } from "../components/site-footer";
import { ProductGrid } from "../components/product-grid";

export const metadata: Metadata = {
  title: "K&C Shopping — curated elegance, discover independent shops",
  description:
    "A curated marketplace for individual style. Browse K&C shops, discover trending pieces, and order directly from the seller.",
};

export const dynamic = "force-dynamic";

function ShareIcons() {
  const paths = [
    "M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H16.7V3.6A21 21 0 0 0 14.3 3.5c-2.4 0-4 1.45-4 4.1v2.3H7.6V13h2.7v8h3.2Z",
    "M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6Zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm6.1-8.1a1.12 1.12 0 1 1-2.24 0 1.12 1.12 0 0 1 2.24 0ZM21 8.9c-.06-1.3-.35-2.45-1.3-3.4-.95-.95-2.1-1.24-3.4-1.3-1.33-.08-5.27-.08-6.6 0-1.3.06-2.44.35-3.4 1.3-.95.95-1.24 2.1-1.3 3.4-.08 1.33-.08 5.27 0 6.6.06 1.3.35 2.44 1.3 3.4.96.95 2.1 1.24 3.4 1.3 1.33.08 5.27.08 6.6 0 1.3-.06 2.45-.35 3.4-1.3.95-.96 1.24-2.1 1.3-3.4.08-1.33.08-5.27 0-6.6Z",
    "M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Zm-7.9 3.6c.3 0 .5-.1.8-.2a5.6 5.6 0 0 0 2-1.9c.2-.4.4-.9.4-1.4 0-.3-.1-.5-.2-.7l-1-.5c-.2-.1-.3-.1-.4.1l-.4.6c-.1.2-.2.2-.4.1a4.4 4.4 0 0 1-2-2c-.1-.2 0-.3.1-.4l.5-.6c.1-.2.1-.3 0-.4l-.5-1c-.1-.2-.2-.3-.4-.3-.5 0-1 .2-1.3.5-.4.4-.6.9-.6 1.4 0 .6.2 1.2.5 1.7a7.6 7.6 0 0 0 3.4 3c.4.2.9.3 1.3.3Z",
  ];

  return (
    <span className="flex items-center gap-2.5 text-neutral-800">
      {paths.map((path, index) => (
        <svg key={index} viewBox="0 0 24 24" aria-hidden="true" className="h-[15px] w-[15px]" fill="currentColor">
          <path d={path} />
        </svg>
      ))}
    </span>
  );
}

export default async function MarketplaceHomePage() {
  const user = await getCurrentUser();
  // A new seed per visit: the arrangement differs each time, but stays stable
  // within the visit so "load more" never repeats or skips products.
  const seed = newSeed();

  const shops = await listPublicShops({ limit: 9 });

  const withProducts = await Promise.all(
    shops.map(async (shop) => ({
      shop,
      products: await listPublishedProducts(shop.id, 3),
    })),
  );

  const [recommended, arrivals, popular, discovery] = await Promise.all([
    recommendedProducts(user?.account_type === "customer" ? user.id : null, { seed, limit: 12 }),
    newArrivals(6, seed),
    popularProducts(6, seed),
    discoverProducts({ seed, limit: 12 }),
  ]);

  const featuredSellers = withProducts.slice(0, 2);
  const moreSellers = withProducts.slice(2, 8);

  return (
    <div className="min-h-screen bg-black">
      <PublicHeader user={user} />

      <main>
        {/* Hero */}
        <section className="border-b border-line">
          <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
            <div>
              <p className="eyebrow">Curated elegance. Discover</p>

              <h1 className="display mt-4 text-[42px] leading-[0.96] tracking-tight text-white sm:text-[64px] lg:text-[76px]">
                K&amp;C
                <br />
                Shopping.
              </h1>

              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/60">
                A curated marketplace for individual style — independent shops, considered pieces,
                and direct ordering from the people who make and sell them.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/shops" className="btn-primary">
                  Explore Curated Shops
                </Link>
                <Link href="/collections" className="btn-secondary">
                  View Collections
                </Link>
              </div>

              <p className="mt-8 text-[11px] uppercase tracking-[0.2em] text-white/35">
                {shops.length} shop{shops.length === 1 ? "" : "s"} · {recommended.products.length > 0 ? "New pieces weekly" : "Opening soon"}
              </p>
            </div>

            {/* A single piece, treated like a lookbook plate. */}
            <div className="relative hidden aspect-[4/5] overflow-hidden border border-white/10 bg-surface-2 lg:block">
              {recommended.products[0]?.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={recommended.products[0].cover_url}
                  alt=""
                  className="h-full w-full object-cover grayscale contrast-110"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" aria-hidden="true" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/50">Featured piece</p>
                <p className="mt-1 font-serif text-xl text-white">
                  {recommended.products[0]?.name ?? "K&C Selection"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Featured sellers */}
        <section className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6">
          <h2 className="display text-2xl text-white sm:text-3xl">Featured K&amp;C Sellers</h2>

          {shops.length === 0 ? (
            <p className="mt-6 text-sm text-white/50">
              No shops are live yet.{" "}
              <Link href="/signup?role=seller" className="text-white underline">
                Open the first one
              </Link>
              .
            </p>
          ) : (
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {featuredSellers.map(({ shop, products }) => (
                <Link
                  key={shop.id}
                  href={`/shop/${shop.shop_slug}`}
                  className="product-card flex items-center gap-3 p-4 transition-opacity hover:opacity-90"
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100">
                    {shop.shop_logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={shop.shop_logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-serif text-lg text-neutral-700">
                        {shop.shop_name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-neutral-900">
                      {shop.shop_name}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                      Visit shop ↗
                    </span>
                  </span>
                  <span className="sr-only">{products.length} products</span>
                </Link>
              ))}

              {moreSellers.map(({ shop, products }) => (
                <Link
                  key={shop.id}
                  href={`/shop/${shop.shop_slug}`}
                  className="relative hidden aspect-square overflow-hidden border border-white/10 bg-surface-2 lg:block"
                  aria-label={shop.shop_name}
                >
                  {products[0]?.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={products[0].images[0].url}
                      alt=""
                      className="h-full w-full object-cover grayscale transition-transform duration-500 hover:scale-105"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center font-serif text-2xl text-white/20">
                      {shop.shop_name.slice(0, 1)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Personalised feed, or a randomised discovery feed for guests */}
        <section className="mx-auto max-w-[1180px] px-4 pb-14 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="display text-2xl text-white sm:text-3xl">
                {recommended.personalised ? "Recommended for you" : "Discover something new"}
              </h2>
              <p className="mt-1 text-[12px] uppercase tracking-[0.14em] text-white/40">
                {recommended.personalised
                  ? "Based on what you have been looking at"
                  : "A different arrangement on every visit"}
              </p>
            </div>
            <Link
              href="/collections"
              className="text-[11px] uppercase tracking-[0.16em] text-white/50 hover:text-white"
            >
              View all →
            </Link>
          </div>

          <div className="mt-6">
            <ProductGrid
              products={recommended.products}
              emptyMessage="New pieces are on their way."
              priorityCount={4}
            />
          </div>
        </section>

        {/* New arrivals */}
        {arrivals.length > 0 ? (
          <section className="mx-auto max-w-[1180px] px-4 pb-14 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="display text-2xl text-white sm:text-3xl">Recently added</h2>
              <p className="text-[12px] uppercase tracking-[0.14em] text-white/40">
                Fresh from our sellers
              </p>
            </div>
            <div className="mt-6">
              <ProductGrid products={arrivals} />
            </div>
          </section>
        ) : null}

        {/* Popular */}
        {popular.length > 0 ? (
          <section className="mx-auto max-w-[1180px] px-4 pb-14 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="display text-2xl text-white sm:text-3xl">Popular now</h2>
              <p className="text-[12px] uppercase tracking-[0.14em] text-white/40">
                Most viewed in the last 30 days
              </p>
            </div>
            <div className="mt-6">
              <ProductGrid products={popular} />
            </div>
          </section>
        ) : null}

        {/* A second, differently shuffled row so no seller owns the page */}
        {discovery.length > 0 ? (
          <section className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="display text-2xl text-white sm:text-3xl">More to explore</h2>
              <Link
                href="/collections"
                className="text-[11px] uppercase tracking-[0.16em] text-white/50 hover:text-white"
              >
                Browse everything →
              </Link>
            </div>
            <div className="mt-6">
              <ProductGrid products={discovery} />
            </div>
          </section>
        ) : null}

        {/* Seller call to action */}
        <section className="border-t border-line">
          <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 lg:flex-row lg:items-center">
            <div>
              <p className="eyebrow">For sellers</p>
              <h2 className="display mt-3 text-2xl text-white sm:text-3xl">
                Bring your shop to K&amp;C.
              </h2>
              <p className="mt-2 max-w-lg text-sm text-white/55">
                Your own link, your products, your prices — and orders you can track from enquiry to
                delivery.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup?role=seller" className="btn-primary">
                Open a shop
              </Link>
              <Link href="/sell" className="btn-secondary">
                Seller portal
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
