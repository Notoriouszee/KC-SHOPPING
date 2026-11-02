import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/session";
import { listPublicShops } from "../../lib/repositories/shop";
import { PublicHeader } from "../../components/public-header";
import { EmptyState } from "../../components/ui";

export const metadata: Metadata = {
  title: "Browse shops",
  description: "Every shop on K&C Shopping — browse before you create an account.",
};

export const dynamic = "force-dynamic";

export default async function ShopsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const shops = listPublicShops({ query: query || undefined, limit: 60 });

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicHeader user={user} />

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Browse shops</h1>
        <p className="mt-1 text-sm text-ink-500">
          Anyone can look around. You only need an account to place an order.
        </p>

        <form className="mt-5 flex gap-2" action="/shops">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search shops"
            className="input w-full sm:max-w-sm"
            aria-label="Search shops"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>

        {shops.length === 0 ? (
          <div className="card mt-6">
            <EmptyState
              title={query ? "No shops match that search" : "No shops yet"}
              description={
                query
                  ? "Try a different name, or clear the search."
                  : "Shops appear here as soon as sellers publish products."
              }
              action={
                query ? (
                  <Link href="/shops" className="btn-secondary mt-2">
                    Clear search
                  </Link>
                ) : null
              }
            />
          </div>
        ) : (
          <>
            <p className="mt-5 text-sm text-ink-500">
              {shops.length} shop{shops.length === 1 ? "" : "s"}
              {query ? ` matching “${query}”` : ""}
            </p>

            <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shops.map((shop) => (
                <li key={shop.id}>
                  <Link
                    href={`/shop/${shop.shop_slug}`}
                    className="card block h-full p-4 transition-shadow hover:shadow-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
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
                        <p className="truncate text-sm font-semibold text-ink-900">
                          {shop.shop_name}
                        </p>
                        <p className="text-xs text-ink-500">
                          {shop.product_count} product{shop.product_count === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    {shop.shop_description ? (
                      <p className="mt-3 line-clamp-2 text-sm text-ink-600">
                        {shop.shop_description}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
