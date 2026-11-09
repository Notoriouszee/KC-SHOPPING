import Link from "next/link";
import { formatNaira } from "../lib/domain/money";

/**
 * Customer-facing catalogue tile.
 *
 * Deliberately compact, the way a real marketplace lists thousands of items: a
 * square image well, a two-line name, a prominent price and a small shop line.
 * Everything is sized in rem/px rather than proportionally, so the card looks the
 * same at 2 or 6 columns and never turns into an oversized poster.
 *
 * The image is `object-contain` on a light well: portrait, landscape, square and
 * transparent PNGs all sit inside the same box without cropping or distortion.
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
    <article className="group relative flex h-full min-w-0 flex-col overflow-hidden border border-neutral-200 bg-white text-neutral-900 transition-colors hover:border-neutral-400">
      <Link
        href={`/product/${product.shop_slug}/${product.slug}`}
        className="relative block aspect-square w-full overflow-hidden bg-neutral-50"
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
            sizes="(max-width: 640px) 45vw, (max-width: 1280px) 22vw, 15vw"
            className="absolute inset-0 h-full w-full object-contain p-1.5"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.12em] text-neutral-400">
            No photo
          </span>
        )}

        {soldOut ? (
          <span className="absolute left-1 top-1 bg-black px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-white">
            Sold out
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col px-2 pb-2 pt-1.5">
        <Link
          href={`/product/${product.shop_slug}/${product.slug}`}
          className="line-clamp-2 min-h-[30px] text-[12px] leading-[15px] text-neutral-800 hover:underline"
        >
          {product.name}
        </Link>

        <p className="mt-1 text-[15px] font-semibold leading-none tracking-tight text-neutral-900">
          {formatNaira(product.price_kobo)}
        </p>

        {showShop ? (
          <p className="mt-1 truncate text-[10px] uppercase tracking-[0.08em] text-neutral-500">
            {product.shop_name}
          </p>
        ) : null}
      </div>
    </article>
  );
}