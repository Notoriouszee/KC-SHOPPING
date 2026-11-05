import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../lib/auth/session";
import { appUrl, shopUrl } from "../../../lib/config";
import { formatDateTime } from "../../../lib/domain/dates";
import {
  assignInitialSlug,
  getShopProfile,
  listSlugHistory,
  slugChangeCooldown,
} from "../../../lib/repositories/shop";
import { CopyButton } from "../../../components/copy-button";
import { ShopProfileForm } from "../../../components/shop-profile-form";
import { ShopSlugForm } from "../../../components/shop-slug-form";
import { Alert, Card, CardHeader, PageHeader } from "../../../components/ui";

export const metadata: Metadata = { title: "My Shop" };

export default async function MyShopPage() {
  const user = await requireUser();
  let shop = await getShopProfile(user.id);

  // Every seller must have a working shop link; older accounts are backfilled
  // on first visit rather than being shown a broken page.
  if (shop && !shop.shop_slug) {
    await assignInitialSlug(user.id, shop.business_name);
    shop = await getShopProfile(user.id);
  }

  if (!shop || !shop.shop_slug) {
    return (
      <div>
        <PageHeader title="My Shop" />
        <Alert tone="danger">
          We could not set up your shop link. Please refresh the page, or contact support if this
          keeps happening.
        </Alert>
      </div>
    );
  }

  const origin = appUrl();
  const publicUrl = shopUrl(shop.shop_slug, origin);
  const cooldown = await slugChangeCooldown(user.id);
  const history = await listSlugHistory(user.id);

  return (
    <div>
      <PageHeader
        title="My Shop"
        description="Your public storefront — share this link so customers can find you."
        action={
          <Link
            href={`/shop/${shop.shop_slug}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            View shop ↗
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Your shop link"
              description="Anyone with this link can view your shop — no account needed."
            />
            <div className="space-y-3 px-5 py-5">
              <div className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <code className="break-all text-sm font-medium text-brand-800">{publicUrl}</code>
                <div className="flex shrink-0 items-center gap-2">
                  <CopyButton value={publicUrl} label="Copy link" />
                </div>
              </div>
              <p className="text-xs text-ink-500">
                Paste it in your WhatsApp status, Instagram bio, Facebook page or anywhere customers
                can find you.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Shop details"
              description="How your shop appears to customers."
            />
            <div className="px-5 py-5">
              <ShopProfileForm shop={shop} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Change your shop link"
              description="Pick something short and easy to say out loud."
            />
            <div className="px-5 py-5">
              <ShopSlugForm
                currentSlug={shop.shop_slug}
                origin={origin}
                canChange={cooldown.canChange}
                nextAllowedAt={cooldown.nextAllowedAt}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Shop preview" />
            <div className="px-5 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                  {shop.shop_logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shop.shop_logo_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-lg font-semibold text-slate-400" aria-hidden="true">
                      {(shop.shop_name ?? shop.business_name).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink-900">
                    {shop.shop_name ?? shop.business_name}
                  </p>
                  <p className="text-xs text-ink-500">/shop/{shop.shop_slug}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-ink-500">
                {shop.shop_description ?? "Add a short description so customers know what you sell."}
              </p>
              {shop.shop_contact_phone ? (
                <p className="mt-3 text-sm text-ink-700">Contact: {shop.shop_contact_phone}</p>
              ) : (
                <p className="mt-3 text-xs text-amber-700">
                  No contact phone set — customers will not see a call or WhatsApp button yet.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Previous links" description="These redirect to your shop." />
            <div className="px-5 py-4">
              {history.length === 0 ? (
                <p className="text-sm text-ink-500">
                  You have not changed your link yet. If you do, old links keep working.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {history.map((entry) => (
                    <li key={entry.old_slug} className="flex items-start justify-between gap-3">
                      <code className="break-all text-ink-700">/shop/{entry.old_slug}</code>
                      <span className="shrink-0 text-xs text-ink-500">
                        {formatDateTime(entry.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
