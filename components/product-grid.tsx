import { ProductTile, type ProductTileData } from "./product-tile";

/**
 * Responsive product grid: 2 columns on phones, 3 on small tablets, 4 on laptops
 * and 6 on wide screens. The fixed 1:1 image box keeps every row even.
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
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-6">
      {products.map((product, index) => (
        <li key={product.id} className="min-w-0">
          <ProductTile product={product} showShop={showShop} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}