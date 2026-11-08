import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/session";
import { listPublicShops } from "../../lib/repositories/shop";
import { searchPublicProducts } from "../../lib/repositories/products";
import { recordActivity } from "../../lib/repositories/activity";
import { formatNaira } from "../../lib/domain/money";
import { PublicHeader } from "../../components/public-header";
import { SiteFooter } from "../../components/site-footer";
import { ProductGrid } from "../../components/product-grid";

export const metadata: Metadata = {
  title: "Search shops and products",
};

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (query && user?.account_type === "customer") {
    await recordActivity({ userId: user.id, kind: "search", term: query });
  }

  const shops = query ? await listPublicShops({ query, limit: 24 }) : [];
  const products = query ? await searchPublicProducts(query, 48) : [];
  const nothing = query !== "" && shops.length === 0 && products.length === 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicHeader user={user} />

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          {query ? `Results for “${query}”` : "Search"}
        </h1>

        <form action="/search" className="mt-4 flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Shop name, product name, or description"
            className="input w-full sm:max-w-md"
            aria-label="Search shops and products"
            autoFocus={!query}
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>

        {!query ? (
          <p className="mt-6 text-sm text-neutral-500">
            Search across every shop and published product on K&C Shopping. You can browse without an
            account; you only need one to order.
          </p>
        ) : nothing ? (
          <div className="card mt-6 px-6 py-12 text-center">
            <p className="text-base font-semibold text-neutral-900">Nothing matched “{query}”</p>
            <p className="mt-1 text-sm text-neutral-500">Try a shorter word, or browse the shops instead.</p>
            <Link href="/shops" className="btn-primary mt-4">
              Browse shops
            </Link>
          </div>
        ) : null}

        {products.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-neutral-900">
              Products <span className="text-sm font-normal text-neutral-500">({products.length})</span>
            </h2>
            <ProductGrid
              products={products.map((product) => ({
                id: product.id,
                name: product.name,
                slug: product.slug,
                price_kobo: product.price_kobo,
                shop_slug: product.shop_slug,
                shop_name: product.shop_name,
                cover_url: product.cover_url,
                availability: product.availability,
              }))}
              priorityCount={4}
            />
          </section>
        ) : null}

        {shops.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-neutral-900">
              Shops <span className="text-sm font-normal text-neutral-500">({shops.length})</span>
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shops.map((shop) => (
                <li key={shop.id}>
                  <Link
                    href={`/shop/${shop.shop_slug}`}
                    className="card block h-full p-4 transition-shadow hover:shadow-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
                        {shop.shop_logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={shop.shop_logo_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-base font-semibold text-slate-400" aria-hidden="true">
                            {shop.shop_name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-900">{shop.shop_name}</p>
                        <p className="text-xs text-neutral-500">
                          {shop.product_count} product{shop.product_count === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    {shop.shop_description ? (
                      <p className="mt-3 line-clamp-2 text-sm text-ink-600">{shop.shop_description}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-10 text-center text-xs text-neutral-500">
          <p>
            <Link href="/" className="font-semibold text-neutral-900 hover:underline">
              ← Back to the marketplace
            </Link>
          </p>
        </footer>
      </main>

      <SiteFooter />
    </div>
  );
}
