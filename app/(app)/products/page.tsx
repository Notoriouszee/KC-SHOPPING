import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../lib/auth/session";
import { appUrl, productUrl } from "../../../lib/config";
import { isPublicationStatus } from "../../../lib/domain/status";
import { listProducts, productStats } from "../../../lib/repositories/products";
import { productPerformanceMap } from "../../../lib/repositories/analytics";
import { getShopProfile } from "../../../lib/repositories/shop";
import { ProductCard } from "../../../components/product-card";
import { Alert, Card, EmptyState, PageHeader, StatCard } from "../../../components/ui";

export const metadata: Metadata = { title: "Products" };

type Search = { status?: string; q?: string; deleted?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;

  const status = isPublicationStatus(params.status) ? params.status : "all";
  const query = (params.q ?? "").trim();
  const shop = await getShopProfile(user.id);
  const origin = appUrl();

  const products = await listProducts(user.id, {
    status,
    query: query || undefined,
    limit: 300,
  });
  const stats = await productStats(user.id);
  // Sharing results, shown next to the catalogue the seller manages.
  const performance = await productPerformanceMap(
    user.id,
    products.map((product) => product.id),
  );

  const tabs = [
    { key: "all", label: `All (${stats.total})`, href: "/products" },
    { key: "published", label: `Published (${stats.published})`, href: "/products?status=published" },
    { key: "draft", label: `Drafts (${stats.drafts})`, href: "/products?status=draft" },
  ];

  return (
    <div>
      <PageHeader
        title="Products"
        description="Your catalogue. Published products appear on your public shop."
        action={
          <Link href="/products/new" className="btn-primary">
            + Add product
          </Link>
        }
      />

      {params.deleted === "1" ? (
        <div className="mb-5">
          <Alert tone="success">Product deleted.</Alert>
        </div>
      ) : null}

      {!shop?.shop_slug ? (
        <div className="mb-5">
          <Alert tone="warn">
            Set up your shop link first — products need a shop to live under.{" "}
            <Link href="/my-shop" className="font-semibold underline">
              Go to My Shop
            </Link>
          </Alert>
        </div>
      ) : null}

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Products" value={String(stats.total)} />
        <StatCard label="Published" value={String(stats.published)} tone="success" />
        <StatCard
          label="Out of stock"
          value={String(stats.outOfStock)}
          tone={stats.outOfStock > 0 ? "warn" : "neutral"}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                status === tab.key
                  ? "bg-ink-900 text-white"
                  : "text-ink-500 hover:bg-slate-200/70 hover:text-ink-900"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <form className="flex w-full gap-2 sm:w-auto" action="/products">
          {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search products"
            className="input w-full sm:w-64"
            aria-label="Search products"
          />
          <button type="submit" className="btn-secondary">
            Search
          </button>
        </form>
      </div>

      {products.length === 0 ? (
        <Card>
          <EmptyState
            title={query ? "No products match that search" : "No products yet"}
            description={
              query
                ? "Try a different name or clear the search."
                : "Add your first product — a name, a price and a photo is enough to start sharing your shop."
            }
            action={
              query ? (
                <Link href="/products" className="btn-secondary mt-2">
                  Clear search
                </Link>
              ) : (
                <Link href="/products/new" className="btn-primary mt-2">
                  Add your first product
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              shopName={shop?.shop_name ?? user.business_name}
              productUrl={
                shop?.shop_slug ? productUrl(shop.shop_slug, product.slug, origin) : ""
              }
              performance={performance[product.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
