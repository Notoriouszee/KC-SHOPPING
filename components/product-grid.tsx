import { ProductTile, type ProductTileData } from "./product-tile";

/**
 * Marketplace grid.
 *
 * Column counts follow the brief:
 *   320–639   → 2   (phones, including 320px)
 *   640–767   → 3   (large phones / small tablets)
 *   768–1023  → 4   (tablets, small laptops)
 *   1024–1279 → 4   (laptops)
 *   1280–1535 → 5   (standard desktop)
 *   1536+     → 6   (wide desktop)
 *
 * `min-w-0` on each cell plus `truncate` inside the tile guarantee no horizontal
 * overflow on narrow screens.
 */
export function ProductGrid({
  products,
  emptyMessage = "Nothing here yet.",
  showShop = true,
  priorityCount = 0,
}: {
  products: ProductTileData[];
  emptyMessage?: string;
  showShop?: boolean;
  priorityCount?: number;
}) {
  if (products.length === 0) {
    return (
      <p className="border border-line bg-surface-2 px-5 py-10 text-center text-sm text-white/50">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {products.map((product, index) => (
        <li key={product.id} className="min-w-0">
          <ProductTile product={product} showShop={showShop} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}