import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/session";
import { discoverProducts, newSeed } from "../../lib/repositories/discovery";
import { PublicHeader } from "../../components/public-header";
import { SiteFooter } from "../../components/site-footer";
import { ProductGrid } from "../../components/product-grid";

export const metadata: Metadata = {
  title: "Collections",
  description: "Every piece currently available across K&C Shopping shops.",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function CollectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; seed?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;

  // The seed lives in the URL so page 2 continues the same shuffle instead of
  // re-rolling the whole catalogue between pages.
  const seed = Number(params.seed) || newSeed();
  const page = Math.max(1, Number(params.page) || 1);

  const products = await discoverProducts({
    seed,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const hasNext = products.length === PAGE_SIZE;

  return (
    <div className="min-h-screen bg-black">
      <PublicHeader user={user} />

      <main className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6">
        <p className="eyebrow">The collection</p>
        <h1 className="display mt-3 text-[34px] leading-tight text-white sm:text-[46px]">
          Every piece, in one place.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-white/55">
          A rotating selection from every live K&amp;C shop — the order changes each time you visit,
          so different sellers get a turn at the front.
        </p>

        <div className="mt-10">
          <ProductGrid
            products={products}
            emptyMessage="Nothing published yet — check back soon."
            priorityCount={4}
          />
        </div>

        <nav aria-label="Pagination" className="mt-10 flex items-center justify-between">
          {page > 1 ? (
            <Link
              href={`/collections?seed=${seed}&page=${page - 1}`}
              className="btn-secondary"
            >
              ← Previous
            </Link>
          ) : (
            <span />
          )}

          <span className="text-[11px] uppercase tracking-[0.16em] text-white/40">Page {page}</span>

          {hasNext ? (
            <Link href={`/collections?seed=${seed}&page=${page + 1}`} className="btn-secondary">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </main>

      <SiteFooter />
    </div>
  );
}