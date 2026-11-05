import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/session";
import { listPublicCatalogue } from "../../lib/repositories/products";
import { formatNaira } from "../../lib/domain/money";
import { PublicHeader } from "../../components/public-header";
import { SiteFooter } from "../../components/site-footer";

export const metadata: Metadata = {
  title: "Collections",
  description: "Every piece currently available across K&C Shopping shops.",
};

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  const user = await getCurrentUser();
  const pieces = await listPublicCatalogue(60);

  return (
    <div className="min-h-screen bg-black">
      <PublicHeader user={user} />

      <main className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6">
        <p className="eyebrow">The collection</p>
        <h1 className="display mt-3 text-[34px] leading-tight text-white sm:text-[46px]">
          Every piece, in one place.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-white/55">
          {pieces.length} piece{pieces.length === 1 ? "" : "s"} from every live K&amp;C shop.
        </p>

        {pieces.length === 0 ? (
          <p className="mt-12 text-sm text-white/50">
            Nothing published yet.{" "}
            <Link href="/shops" className="text-white underline underline-offset-4">
              Browse the shops instead
            </Link>
            .
          </p>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {pieces.map((piece) => (
              <article key={piece.id} className="product-card">
                <Link href={`/product/${piece.shop_slug}/${piece.slug}`} className="block">
                  <span className="block aspect-[4/5] overflow-hidden bg-neutral-100">
                    {piece.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={piece.cover_url}
                        alt={piece.name}
                        className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : null}
                  </span>
                </Link>
                <div className="px-3 py-3">
                  <p className="truncate text-[13px] font-medium text-neutral-900">{piece.name}</p>
                  <p className="text-[12px] text-neutral-500">{formatNaira(piece.price_kobo)}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="truncate text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                      {piece.shop_name}
                    </span>
                    <Link
                      href={`/product/${piece.shop_slug}/${piece.slug}`}
                      className="shrink-0 border-b border-neutral-900 pb-0.5 text-[11px] font-medium text-neutral-900"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
