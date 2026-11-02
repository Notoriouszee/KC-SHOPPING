import Link from "next/link";
import { formatNaira } from "../lib/domain/money";
import { PUBLICATION_LABELS } from "../lib/domain/status";
import type { ProductWithImages } from "../lib/domain/types";
import type { ProductPerformance } from "../lib/repositories/analytics";
import { togglePublicationAction } from "../lib/actions/products";
import { ShareProductButton } from "./share-product-button";
import { Badge } from "./ui";

export function ProductCard({
  product,
  productUrl,
  shopName,
  performance,
}: {
  product: ProductWithImages;
  productUrl: string;
  shopName: string;
  performance?: ProductPerformance;
}) {
  const cover = product.images[0];
  const published = product.publication_status === "published";

  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] bg-slate-100">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.url}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            No photo yet
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <Badge tone={published ? "success" : "neutral"}>
            {PUBLICATION_LABELS[product.publication_status]}
          </Badge>
          {product.availability === "out_of_stock" ? <Badge tone="warn">Out of stock</Badge> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-sm font-semibold text-ink-900">{product.name}</h3>
        <p className="mt-1 text-base font-semibold text-ink-900">{formatNaira(product.price_kobo)}</p>

        <p className="mt-1 text-xs text-ink-500">
          {published && performance
            ? `${performance.views} view${performance.views === 1 ? "" : "s"} · ${performance.orders} order${performance.orders === 1 ? "" : "s"} · ${performance.conversionRate}% conversion`
            : `${product.images.length} photo${product.images.length === 1 ? "" : "s"}${
                product.description ? ` · ${product.description.slice(0, 60)}` : ""
              }`}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <Link
            href={`/products/${product.id}`}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-slate-50"
          >
            Edit
          </Link>

          {published ? (
            <ShareProductButton
              variant="compact"
              label="Share"
              product={{
                name: product.name,
                priceLabel: formatNaira(product.price_kobo),
                url: productUrl,
                imageUrl: cover?.url ?? null,
                shopName,
                description: product.description,
                available: product.availability === "available",
              }}
            />
          ) : null}

          <form action={togglePublicationAction} className="ml-auto">
            <input type="hidden" name="productId" value={product.id} />
            <input
              type="hidden"
              name="publicationStatus"
              value={published ? "draft" : "published"}
            />
            <button
              type="submit"
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                published
                  ? "text-ink-500 hover:bg-slate-100"
                  : "bg-white text-black hover:bg-neutral-200"
              }`}
            >
              {published ? "Unpublish" : "Publish"}
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}
