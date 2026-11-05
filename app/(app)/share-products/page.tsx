import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../lib/auth/session";
import { appUrl, productUrl, shopUrl } from "../../../lib/config";
import { formatNaira } from "../../../lib/domain/money";
import { getPublicShop, getShopProfile } from "../../../lib/repositories/shop";
import { listProducts } from "../../../lib/repositories/products";
import { sourceBreakdown, shopPerformance } from "../../../lib/repositories/analytics";
import { SOURCE_LABELS, type ViewSource } from "../../../lib/domain/analytics";
import { CopyButton } from "../../../components/copy-button";
import { ShareProductButton } from "../../../components/share-product-button";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "../../../components/ui";

export const metadata: Metadata = { title: "Share Products" };

export default async function ShareProductsPage() {
  const user = await requireUser();
  const shopProfile = await getShopProfile(user.id);
  const shop = shopProfile?.shop_slug ? await getPublicShop(shopProfile.shop_slug) : null;
  const origin = appUrl();

  const products = await listProducts(user.id, { status: "published", limit: 300 });
  const link = shop ? shopUrl(shop.shop_slug, origin) : null;
  const performance = await shopPerformance(user.id, 30);
  const sources = await sourceBreakdown(user.id, 30);
  const totalViews = sources.reduce((sum, row) => sum + row.views, 0);

  return (
    <div>
      <PageHeader
        title="Share Products"
        description="Turn a Status view into an order — share a product, not just a picture."
      />

      {!shop || !link ? (
        <Card>
          <EmptyState
            title="Set up your shop first"
            description="Products are shared through your public shop link. Create it in My Shop."
            action={
              <Link href="/my-shop" className="btn-primary mt-2">
                Go to My Shop
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Published products"
                description="Only published products have a public link."
                action={
                  <Link
                    href="/products"
                    className="text-sm font-semibold text-brand-700 hover:underline"
                  >
                    Manage products
                  </Link>
                }
              />
              {products.length === 0 ? (
                <EmptyState
                  title="Nothing to share yet"
                  description="Publish a product and it will appear here with a ready-to-share link."
                  action={
                    <Link href="/products/new" className="btn-primary mt-2">
                      Add a product
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {products.map((product) => {
                    const cover = product.images[0];
                    return (
                      <li key={product.id} className="flex items-center gap-3 px-5 py-3.5">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                          {cover ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cover.url}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink-900">
                            {product.name}
                          </p>
                          <p className="text-xs text-ink-500">
                            {formatNaira(product.price_kobo)}
                            {product.availability === "out_of_stock" ? " · Out of stock" : ""}
                          </p>
                        </div>

                        <div className="shrink-0">
                          <ShareProductButton
                            variant="secondary"
                            label="Share"
                            product={{
                              name: product.name,
                              priceLabel: formatNaira(product.price_kobo),
                              url: productUrl(shop.shop_slug, product.slug, origin),
                              imageUrl: cover?.url ?? null,
                              shopName: shop.shop_name,
                              description: product.description,
                              available: product.availability === "available",
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title="How sharing works"
                description="What K&C Shopping can and cannot do for you."
              />
              <div className="space-y-4 px-5 py-4 text-sm text-ink-700">
                <div>
                  <p className="font-semibold text-ink-900">WhatsApp Status</p>
                  <p className="mt-1">
                    Use <strong>Share to WhatsApp</strong>, or copy the link, then open WhatsApp →
                    Status and paste it. Adding the product photo first is what makes the Status
                    look right.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-ink-900">Instagram Stories</p>
                  <p className="mt-1">
                    Copy the link, add your photo to the Story, then use the <strong>link sticker</strong>{" "}
                    to paste it. K&C Shopping cannot insert a sticker for you.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-ink-900">Facebook, X and others</p>
                  <p className="mt-1">
                    Paste the link into a post. Platforms that support previews will show your
                    product photo and price.
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-ink-500">
                  Previews and clickable links vary by app version, privacy settings and sharing
                  method. The link itself always opens the correct product page.
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Your shop link" description="Lead with this in your bio." />
              <div className="space-y-3 px-5 py-4">
                <code className="block break-all rounded-xl bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800">
                  {link}
                </code>
                <CopyButton value={link} label="Copy shop link" />
                <p className="text-xs text-ink-500">
                  Share your shop when you want customers to browse everything you sell.
                </p>
              </div>
            </Card>

            <Card>
              <CardHeader title="Tips that get orders" />
              <ul className="space-y-3 px-5 py-4 text-sm text-ink-700">
                {[
                  "Post the photo and the link together — a link alone gets fewer taps.",
                  "Say the price in the caption; people dislike asking.",
                  "Share one product at a time. A single link converts better than a list.",
                  "Reply fast. Orders that are answered within minutes close far more often.",
                ].map((tip) => (
                  <li key={tip} className="flex gap-2">
                    <span aria-hidden="true" className="text-brand-600">
                      ✓
                    </span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHeader
                title="Last 30 days"
                description="What your sharing actually produced."
              />
              <div className="grid grid-cols-3 gap-2 px-5 py-4 text-center">
                <div>
                  <p className="text-xl font-semibold text-ink-900">{performance.views}</p>
                  <p className="text-[11px] text-ink-500">views</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-ink-900">{performance.uniqueVisitors}</p>
                  <p className="text-[11px] text-ink-500">visitors</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-brand-700">{performance.orders}</p>
                  <p className="text-[11px] text-ink-500">orders</p>
                </div>
              </div>

              {sources.length > 0 ? (
                <div className="border-t border-slate-100 px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Where views came from
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {sources.map((row) => {
                      const label =
                        SOURCE_LABELS[row.source as ViewSource] ?? row.source;
                      const share = totalViews > 0 ? Math.round((row.views / totalViews) * 100) : 0;
                      return (
                        <li key={row.source} className="flex items-center gap-2 text-sm">
                          <span className="w-20 shrink-0 text-ink-700">{label}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className="block h-full rounded-full bg-brand-500"
                              style={{ width: `${Math.max(share, 3)}%` }}
                            />
                          </span>
                          <span className="w-10 shrink-0 text-right text-xs text-ink-500">
                            {row.views}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
                    Apps often strip the referrer, so some visits are counted as “Direct”. K&C Shopping
                    never claims to know who viewed a Status — only that a link was opened.
                  </p>
                </div>
              ) : (
                <p className="border-t border-slate-100 px-5 py-4 text-sm text-ink-500">
                  No visits recorded yet. Share a product link and views will appear here.
                </p>
              )}
            </Card>

            <Card>
              <CardHeader title="At a glance" />
              <div className="flex flex-wrap gap-2 px-5 py-4">
                <Badge tone="success">{products.length} shareable</Badge>
                {shop ? <Badge tone="neutral">@{shop.shop_slug}</Badge> : null}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
