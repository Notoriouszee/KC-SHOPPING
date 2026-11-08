import Link from "next/link";
import { formatNaira } from "../lib/domain/money";

/**
 * Customer-facing catalogue tile.
 *
 * Consistency is the point: every image sits in a 1:1 box with `object-contain`,
 * so portrait, landscape and transparent PNGs all occupy the same space and the
 * cards stay aligned. Cards are flex columns with the price pinned to the bottom,
 * so a one-line name and a two-line name still produce equal-height tiles.
 *
 * Server component: no hooks, no client bundle cost.
 */

export type ProductTileData = {
  id: string;
  name: string;
  slug: string;
  price_kobo: number;
  shop_slug: string;
  shop_name: string;
  cover_url: string | null;
  availability?: string;
};

export function ProductTile({
  product,
  showShop = true,
  priority = false,
}: {
  product: ProductTileData;
  showShop?: boolean;
  priority?: boolean;
}) {
  const soldOut = product.availability ? product.availability !== "available" : false;

  return (
    <article className="group flex h-full flex-col overflow-hidden border border-neutral-200 bg-white text-neutral-900 transition-shadow hover:shadow-md">
      <Link
        href={`/product/${product.shop_slug}/${product.slug}`}
        className="relative block aspect-square overflow-hidden bg-white"
        tabIndex={-1}
        aria-hidden="true"
      >
        {product.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.cover_url}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] uppercase tracking-[0.14em] text-neutral-400">
            No photo
          </span>
        )}

        {soldOut ? (
          <span className="absolute left-0 top-0 bg-black px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white">
            Sold out
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-1 px-2.5 pb-2.5 pt-2">
        <Link
          href={`/product/${product.shop_slug}/${product.slug}`}
          className="line-clamp-2 min-h-[2.5rem] text-[13px] leading-[1.25rem] text-neutral-800 hover:underline"
        >
          {product.name}
        </Link>

        <p className="mt-auto text-[15px] font-semibold text-neutral-900">
          {formatNaira(product.price_kobo)}
        </p>

        {showShop ? (
          <p className="truncate text-[11px] uppercase tracking-[0.1em] text-neutral-500">
            {product.shop_name}
          </p>
        ) : null}
      </div>
    </article>
  );
}