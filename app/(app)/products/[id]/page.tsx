import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "../../../../lib/auth/session";
import { appUrl, productUrl } from "../../../../lib/config";
import { formatDateTime } from "../../../../lib/domain/dates";
import { formatNaira } from "../../../../lib/domain/money";
import { AVAILABILITY_LABELS, PUBLICATION_LABELS } from "../../../../lib/domain/status";
import {
  deleteProductAction,
  setCoverImageAction,
  toggleAvailabilityAction,
  togglePublicationAction,
} from "../../../../lib/actions/products";
import { getProduct } from "../../../../lib/repositories/products";
import { getShopProfile } from "../../../../lib/repositories/shop";
import { CopyButton } from "../../../../components/copy-button";
import { ConfirmForm } from "../../../../components/confirm-form";
import { ProductForm } from "../../../../components/product-form";
import { ShareProductButton } from "../../../../components/share-product-button";
import { productPerformance } from "../../../../lib/repositories/analytics";
import { Badge } from "../../../../components/ui";
import { Alert, Card, CardHeader, PageHeader } from "../../../../components/ui";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;

  const product = await getProduct(user.id, id);
  if (!product) notFound();

  const shop = await getShopProfile(user.id);
  const origin = appUrl();
  const performance = await productPerformance(user.id, product.id, 30);
  const published = product.publication_status === "published";
  const publicLink =
    shop?.shop_slug && published ? productUrl(shop.shop_slug, product.slug, origin) : null;

  return (
    <div>
      <div className="mb-4">
        <Link href="/products" className="text-sm font-medium text-ink-500 hover:text-ink-900">
          ← Back to products
        </Link>
      </div>

      {query.created === "1" ? (
        <div className="mb-4">
          <Alert tone="success">
            {published
              ? "Product created and published — it is live on your shop."
              : "Product saved as a draft. Publish it when you are ready to share."}
          </Alert>
        </div>
      ) : null}

      <PageHeader
        title={product.name}
        description={`${formatNaira(product.price_kobo)} · ${AVAILABILITY_LABELS[product.availability]}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={published ? "success" : "neutral"}>
              {PUBLICATION_LABELS[product.publication_status]}
            </Badge>
            {publicLink ? (
              <Link href={`/product/${shop?.shop_slug}/${product.slug}`} target="_blank" rel="noreferrer" className="btn-secondary">
                View product ↗
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader title="Product details" description="Changes go live as soon as you save." />
          <div className="px-5 py-5">
            <ProductForm product={product} />
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Share this product"
              description="Send it to WhatsApp, or copy the link for your Status or Story."
            />
            <div className="space-y-3 px-5 py-4">
              {publicLink ? (
                <>
                  <ShareProductButton
                    product={{
                      name: product.name,
                      priceLabel: formatNaira(product.price_kobo),
                      url: publicLink,
                      imageUrl: product.images[0]?.url ?? null,
                      shopName: shop?.shop_name ?? user.business_name,
                      description: product.description,
                      available: product.availability === "available",
                    }}
                  />
                  <code className="block break-all rounded-xl bg-slate-50 px-3 py-2 text-sm text-ink-700">
                    {publicLink}
                  </code>
                  <div className="flex items-center gap-2">
                    <CopyButton value={publicLink} label="Copy link" />
                    <Link
                      href={`/product/${shop?.shop_slug}/${product.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      Open page ↗
                    </Link>
                  </div>
                </>
              ) : (
                <p className="text-sm text-ink-500">
                  Drafts have no public link. Publish this product to get a shareable link.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Visibility" />
            <div className="space-y-2 px-5 py-4">
              <form action={togglePublicationAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="publicationStatus" value={published ? "draft" : "published"} />
                <button type="submit" className="btn-secondary w-full">
                  {published ? "Unpublish product" : "Publish product"}
                </button>
              </form>

              <form action={toggleAvailabilityAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input
                  type="hidden"
                  name="availability"
                  value={product.availability === "available" ? "out_of_stock" : "available"}
                />
                <button type="submit" className="btn-secondary w-full">
                  {product.availability === "available"
                    ? "Mark as out of stock"
                    : "Mark as available"}
                </button>
              </form>

              <p className="pt-1 text-xs text-ink-500">
                Unpublished products keep their link but answer 404 until republished.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Last 30 days"
              description="Traffic and orders from this product's link."
            />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Page views</dt>
                <dd className="font-semibold text-ink-900">{performance.views}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Unique visitors</dt>
                <dd className="text-ink-700">{performance.uniqueVisitors}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-500">Orders placed</dt>
                <dd className="text-ink-700">{performance.orders}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                <dt className="text-ink-500">Conversion</dt>
                <dd className="font-semibold text-brand-700">{performance.conversionRate}%</dd>
              </div>
            </dl>
            {performance.views === 0 ? (
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-ink-500">
                No visits recorded yet. Share the product link on WhatsApp or your Story — views
                start counting as soon as customers open it.
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-2 px-5 py-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Link slug</dt>
                <dd className="truncate font-mono text-xs text-ink-700">{product.slug}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Photos</dt>
                <dd className="text-ink-700">{product.images.length}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Created</dt>
                <dd className="text-ink-700">{formatDateTime(product.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Updated</dt>
                <dd className="text-ink-700">{formatDateTime(product.updated_at)}</dd>
              </div>
              {product.published_at ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Published</dt>
                  <dd className="text-ink-700">{formatDateTime(product.published_at)}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {product.images.length > 1 ? (
            <Card>
              <CardHeader title="Cover photo" description="Used first on your shop and in previews." />
              <div className="flex flex-wrap gap-2 px-5 py-4">
                {product.images.map((image, index) => (
                  <form key={image.id} action={setCoverImageAction}>
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="imageId" value={image.id} />
                    <button
                      type="submit"
                      className={`overflow-hidden rounded-lg border-2 ${
                        index === 0 ? "border-brand-500" : "border-transparent hover:border-slate-300"
                      }`}
                      title={index === 0 ? "Current cover" : "Make cover"}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt="" className="h-16 w-16 object-cover" />
                    </button>
                  </form>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Delete product" />
            <div className="px-5 py-4">
              <p className="mb-3 text-sm text-ink-500">
                This removes the product and its photos. Shared links will stop working. Past orders
                that mention this product are not affected.
              </p>
              <ConfirmForm
                action={deleteProductAction}
                fields={{ productId: product.id }}
                message={`Delete “${product.name}”? This cannot be undone.`}
              >
                <button type="submit" className="btn-danger w-full">
                  Delete product
                </button>
              </ConfirmForm>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
