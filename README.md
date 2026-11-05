# K&C Shopping

K&C Shopping is an order-management workspace for small Nigerian businesses — orders,
customers, payment tracking and follow-ups in one dashboard. The storefront
extension (public shop links, product pages, social sharing) is being built on top
of that foundation one milestone at a time.

## Current status

| Milestone | Scope | Status |
| --- | --- | --- |
| **M0** | Foundation: auth, dashboard shell, orders, customers, payments, follow-ups | ✅ Complete |
| **M1** | Shop profile, unique shop URL/slug, reserved slugs, logo upload, slug-change redirects | ✅ Complete |
| **M2** | Product catalogue: CRUD, publish/unpublish, multi-photo uploads, public product page | ✅ Complete |
| **M3** | Public shop grid (shipped with M2; remaining polish folded into M4) | ✅ Complete |
| **M4** | Share Product: WhatsApp, native share, photo download, copy details, Share Products page | ✅ Complete |
| **M5** | Open Graph / Twitter previews, JSON-LD, image dimensions, robots | ✅ Complete |
| **M6** | Public order form, server-side pricing, confirmation page, abuse limits | ✅ Complete |
| **M7** | Privacy-first link tracking: views, sources, orders per product, conversion | ✅ Complete |
| **M8** | Security headers, brute-force protection, acceptance suites | ✅ Complete |
| **M9** | Public marketplace, seller/customer accounts, payment details, receipt upload, delivery on delivery | ✅ Complete |
| **M10** | Admin area (visitors by day/month/year, dispute lookup by reference), delivery confirmation, site search, contact page, password reset | ✅ Complete |

All milestones delivered. Demo: marketplace at `/`, seller at `/dashboard`,
customer at `/account`, admin at `/admin`. Sign in with `ada@mystore.ng` (seller)
or `blessing@customer.ng` (customer) — password `orderpilot123` for both. The
admin account is created by the seed (see “Admin” below).

## Deploying to Vercel

Vercel's filesystem is read-only (only `/tmp` is writable), so the app must not
create files at runtime. Two switches control that:

| Variable | Values | Effect |
| --- | --- | --- |
| `DATA_BACKEND` | `supabase` / `sqlite` | Postgres or the local file. Unset means "Postgres in production, SQLite otherwise". |
| `STORAGE_BACKEND` | `supabase` / `local` | Uploads to a bucket or to `data/uploads`. Same defaulting rule. |

Production fails loudly rather than falling back: with `NODE_ENV=production` and
no `SUPABASE_DB_URL` the data layer throws an actionable error, and without
Supabase Storage the upload path does the same. Nothing silently writes to `/tmp`.

### Required environment variables on Vercel

```
NEXT_PUBLIC_APP_URL      https://your-domain (or the vercel.app URL)
DATA_BACKEND             supabase
STORAGE_BACKEND          supabase
SUPABASE_URL             https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY  (secret, server-only)
SUPABASE_DB_URL          postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
PAYSTACK_SECRET_KEY      sk_live_… (or sk_test_… while testing)
SELLER_PLAN_KOBO         250000
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is optional: the browser never talks to Supabase
directly. `PG_POOL_MAX` (default 5) keeps each serverless instance's pool small.

### Applying the schema

```bash
pnpm db:supabase                       # applies supabase/migrations/*.sql in order
node --import ./scripts/register.mjs scripts/supabase-check.mjs
```

The migrations are idempotent and tracked in `_migrations`, so this is safe to
re-run. `0015_postgres_primary_store.sql` adds the `sessions` table, the
`profiles.password_hash` column and converts `orders.delivery_fee_on_delivery`
from boolean to integer (the app stores 0/1).

### Migrating an existing install

```bash
pnpm db:supabase                                           # schema (idempotent)
node --import ./scripts/register.mjs scripts/migrate-media.mjs   # files -> Storage
node --import ./scripts/register.mjs scripts/production-smoke.mjs # end-to-end check
```

`migrate-media.mjs` uploads anything still referenced as `/media/...` to the
right bucket and rewrites the URL in the database, so old rows stop pointing at
files that only existed on a laptop.

`production-smoke.mjs` creates a seller, product, order, payment and subscription
against Supabase, uploads and re-fetches a real image, then deletes everything it
made. It is the fastest way to confirm a deployment's environment variables.

### Local development

Nothing changes: `pnpm dev` uses SQLite in `data/` and uploads in `data/uploads`.
To run locally against Supabase, set `DATA_BACKEND=supabase` and
`STORAGE_BACKEND=supabase` in `.env.local` (this is what `.env.local` in this
checkout does, so local behaviour matches production).

`pnpm db:sync` still exists to copy SQLite data into Supabase; it is only useful
when running locally on the SQLite backend.

## Seller subscriptions (Paystack)

Every seller gets **one free month**. After that the shop stays visible but the
catalogue becomes read-only until the monthly plan is paid.

- Plan price: `SELLER_PLAN_KOBO` (default `250000`, i.e. ₦2,500/month).
- Checkout: `POST /transaction/initialize` from the server, hosted page at
  Paystack, then **verification** at `/api/paystack/callback` — the redirect is
  never trusted, the reference is re-verified and the amount must match.
- Webhook: `/api/paystack/webhook` verifies the `x-paystack-signature` HMAC-SHA512
  over the raw body, so a payment is recorded even if the buyer closes the tab.
- Paying early or during the trial **extends** from the later of the trial end and
  the current period, so no days are lost.
- The billing screen is `/billing`; lapsed sellers see a banner in the dashboard.

With the test keys, use card `4084 0840 8408 4081`, any future expiry, CVV `408`.

## Supabase mirror

The app still writes to SQLite. `pnpm db:sync` copies every table into Supabase
(upsert on the primary key, deletions propagated), and `pnpm db:sync:watch` repeats
it every 60 seconds so the Supabase dashboard stays current.

- Column lists are intersected with the remote schema, so drift cannot break it.
- `shop_slug_history` is skipped: its Postgres columns (`old_slug`, `seller_id`,
  `created_at`) do not overlap the local table.
- This is a **mirror**, not the primary store: SQLite remains authoritative until
  the repository layer is ported to Postgres. The port is the next step if you
  want Supabase to be the only database.

## Brand and design

The site is **K&C Shopping**: a black canvas, white type, hairline rules and a
serif display face, with the gold mark as the only colour.

- **Logo** — `public/brand/kc-logo.png` (transparent, cut from the supplied
  artwork), `kc-logo-header.png` for the header lockup, `app/icon.png` for the
  favicon and `public/og-default.png` for link previews.
- **Palette** — defined in `tailwind.config.ts`: `canvas #080808`, `surface`
  `#0b0b0b`/`#121212`/`#1a1a1a`, `line #262626`, a gold `brand` ramp for accents.
  `slate` and `ink` are inverted to light-on-dark so ordinary utility classes read
  correctly on the dark canvas.
- **Components** — `app/globals.css`: `.card` (dark surface), `.product-card`
  (white tile, as on the marketplace grid), `.btn-primary` (white on black),
  `.display` (serif headings), `.eyebrow`, `.table`, `.badge`.
- **Public pages** — `/` (hero, *Featured K&C Sellers*, *Trending Pieces*),
  `/shops`, `/shops/[slug]`, `/product/...`, `/collections`, `/search`,
  `/about`, `/gift-cards`, `/sell`, `/affiliate`, `/terms`, `/privacy`,
  `/contact`. All share `PublicHeader` and `SiteFooter`.

## Stack

- **Next.js 15** (App Router, React 19, Server Actions) + TypeScript
- **Tailwind CSS 3** with a small set of component classes in `app/globals.css`
- **Supabase PostgreSQL** as the production target (`supabase/migrations`, RLS)
- **Local SQLite** (Node's built-in `node:sqlite`) so the app runs and is testable
  with no external services or credentials

No native modules, no ORM, no auth SaaS — the data layer is ~600 lines of typed
repositories.

## Running it

```bash
pnpm install          # or npm install
pnpm db:seed          # demo seller, customers, orders, follow-ups
pnpm dev              # http://localhost:3000
```

Demo accounts (password `orderpilot123` for both):
- Seller — `ada@mystore.ng`
- Customer — `blessing@customer.ng`

Other scripts:

```bash
pnpm typecheck        # tsc --noEmit
pnpm build            # production build
pnpm test             # 142 unit/integration tests (no server needed)
pnpm acceptance       # 62 HTTP checks against a running server
pnpm db:reset         # delete the local database file
pnpm db:prune         # drop expired analytics / attempt rows (run nightly)
```

`pnpm acceptance` expects the app on `http://localhost:3100` (override with
`ACCEPTANCE_BASE_URL`) and the demo data seeded.

### Environment

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Origin used to build shop/product links | `http://localhost:3000` |
| `ORDERPILOT_DB_PATH` | Local SQLite file | `./data/orderpilot.db` |
| `ORDERPILOT_UPLOAD_ROOT` | Where uploaded images are written | `./data/uploads` |
| `ORDERPILOT_IP_SALT` | Extra salt for visitor/attempt hashes | `orderpilot` |
| `SUPABASE_URL` | Supabase project URL | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key (browser-safe) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key; bypasses RLS | — |
| `SUPABASE_DB_URL` | Postgres URI for migrations (pooler, IPv4) | — |
| `DATA_BACKEND` | `sqlite` or `supabase` | `sqlite` |

Secrets go in `.env.local`, which is gitignored; `.env.example` documents them.

## Supabase

The production backend is provisioned and verified against a real project:

```bash
pnpm db:supabase     # apply supabase/migrations/*.sql (idempotent, tracked)
pnpm db:check        # tables, public_shops view, storage buckets
node --import ./scripts/register.mjs scripts/supabase-rls-smoke.mjs
node --import ./scripts/register.mjs scripts/driver-smoke.mjs
```

**Schema** — 11 migrations create `profiles` (keyed to `auth.users`, with a
trigger that copies `owner_name`, `business_name` and `account_type`), customers,
orders, products, product images/views, follow-ups, slug history, abuse tables and
the `public_shops` view. Three storage buckets: `shop-assets` (public),
`product-images` (public), `payment-receipts` (**private**).

**Connection** — the direct `db.<ref>.supabase.co` host is IPv6-only, and this
machine has no IPv6 route, so the app and scripts use the **session pooler**
(`aws-0-<region>.pooler.supabase.com:5432`, user `postgres.<ref>`). The region is
`eu-west-1`.

**Two bugs found and fixed by testing against the real database:**

1. The public-products policy checked `exists (select 1 from profiles …)`. Policies
   run with the *querying* role's privileges, and anon has no policy on `profiles`,
   so the check always failed and **published products were invisible to the
   public**. Fixed in `0011_public_product_policy_fix.sql` by routing the check
   through `public_shops` (a SECURITY DEFINER view).
2. `shop-assets` was referenced but never created; added in
   `0010_shop_assets_bucket.sql`.

**Driver** — `lib/db/driver.ts` defines one async `Db` interface with two
implementations: SQLite (local demo + unit tests) and Postgres. The Postgres one
rewrites `?` placeholders to `$n`, parses `int8`/`numeric` to numbers, and runs
every call inside a transaction with `set local role` + `request.jwt.claims`, so
**RLS applies to the same SQL the repositories already use**. `withContext({ role,
userId })` is how a request runs as a specific user; `anon` and `service` are the
other roles.

Status: backend, policies, buckets and driver are verified. The repositories and
call sites are still on the SQLite path while they are ported to the async
interface, so the app keeps working during the migration.


### Notes for this sandbox

The bundled Node/pnpm live at fixed paths (`~/.dsh/dsh-runtimes/...`). `next dev`
and `next build` fork child processes, which the DSH file sandbox blocks with
`spawn EPERM`; those two commands need a `danger-full-access` escalation. The test
suite runs inside the sandbox normally.

On this machine the project lives inside OneDrive, which turns newly written
build files into cloud placeholders; Node then fails with
`EINVAL: invalid argument, readlink`. If a build fails that way, delete `.next`
and rebuild. (Pointing `distDir` outside the project does **not** work — Next
rewrites `tsconfig.json` with a path that then breaks type checking.)

## Architecture

```
app/
  (auth)/            sign in / sign up (unauthenticated)
  (app)/             dashboard shell — every route requires a session
    dashboard/       overview: stats, recent orders, due follow-ups
    orders/          list, create, detail (status, payment, notes, timeline)
    customers/       list, detail, per-customer order history
    payments/        collected vs outstanding
    follow-ups/      overdue / today / upcoming, complete / reopen / dismiss
    my-shop/         public link, shop details, logo, controlled slug change
    products/        list, create, edit (photos, publish, availability, delete)
    share-products/  share sheet, copy shop link, platform guidance
    settings/        business profile
  (customer)/account/  a buyer's orders, payment details, receipt upload
  shop/[slug]/       public storefront (no auth)
  shops/             public shop directory + search (no auth)
  product/[shopSlug]/[productSlug]/  public product page (no auth)
  product/[shopSlug]/[productSlug]/order/  order form (customer account required)
  order/[token]/     confirmation page (token, no auth) + receipt upload
  media/[...path]/   serves uploaded images from data/uploads
  api/track/view/    records a product view (client beacon, always 204)
  page.tsx           public marketplace home (no auth)
lib/
  auth/              scrypt password hashing, sessions, user lookup
  db/                SQLite connection + numbered migrations
  domain/            money, statuses, dates, slug, phone, share, public-order rules, sources (pure, tested)
  repositories/      tenanted data access (orders, customers, follow-ups, shop, products, public orders, analytics)
  actions/           server actions used by forms
  storage.ts         image validation (magic bytes), storage, traversal-safe reads
supabase/migrations/ production schema + RLS policies
scripts/             seed, reset, dev session helper, TS loader for tests
tests/               node:test suite
```

### Tenancy: two implementations, one rule

Every table carries `seller_id`. In production, PostgreSQL **Row Level Security**
policies compare `seller_id = auth.uid()` on every statement
(`supabase/migrations/0001_core.sql`). Locally there is no `auth.uid()`, so every
repository function takes `sellerId` as its first argument and applies it to every
query, and mutations re-check ownership before writing. The tests assert the same
guarantees the policies provide: one seller can never read or mutate another
seller's rows.

### Money

All amounts are integer **kobo** (1 naira = 100 kobo). `parseNairaToKobo` accepts
`45,000`, `₦1,250.50`, `12500`; `formatNaira` renders `₦45,000` / `₦1,250.50`.

Payment status is always **derived** from recorded money
(`derivePaymentStatus`), so a new order is `unpaid` until the seller records a
payment. There is no code path that creates an order as paid.

### Order lifecycle

```
new → confirmed → processing → ready → delivered
  ↘         ↘           ↘          ↘
            cancelled (terminal)
```

`ORDER_TRANSITIONS` is the single source of truth; invalid jumps are rejected by
the repository, not just hidden in the UI.

### Product catalogue (M2)

Products carry **two independent states**, which is what keeps the model honest:

- `publication_status` — `draft` (only the seller sees it) or `published`.
- `availability` — `available` or `out_of_stock` (listed, cannot be fulfilled).

Public reads go through `getPublicProduct(shopSlug, productSlug)`, which returns
`null` for drafts, deleted products, and shops without a live slug — the page
cannot distinguish "draft" from "never existed", so unpublished products leak
nothing. Unpublishing keeps the row and its link history; it just stops resolving.

Product slugs are unique **per seller** (`/product/<shop>/<product>`) and are
assigned once from the name. Renaming a product keeps the original slug, so a
link already shared on WhatsApp keeps working.

Photos: up to 5 per product, validated by magic bytes in `lib/storage.ts`,
positioned explicitly (`setCoverImage` promotes one to cover). The cover is image
zero — the one the shop grid, product page and (in M5) link previews will use.
Deleting a product returns its image URLs so the files are removed too.

### Sharing (M4)

The share sheet appears on the public product page, the product edit page, each
published product card, and the Share Products page. It offers: WhatsApp, the
device share menu, copy link, copy details, and download photo.

What it deliberately does **not** claim:

- **No automatic Status or Story posting.** No public web API allows an
  unauthorised app to publish to WhatsApp Status or Instagram Stories. The sheet
  gives the exact three-step instructions instead, and `wa.me/?text=` opens
  WhatsApp's own picker where "My status" is usually available.
- **No guaranteed preview image.** Whether a platform shows the photo depends on
  the app, its version and privacy settings; M5 adds the Open Graph tags that
  give platforms something to read.

Implementation notes:

- The Web Share API is used when present. Where the browser supports
  `navigator.canShare({ files })`, the **product photo itself** is shared as a
  `File`, which is how the image reaches a Status on Android.
- Everything degrades to clipboard. `navigator.clipboard` needs a secure origin
  and is missing in some in-app browsers, so a hidden-textarea `execCommand`
  path backs it up, and the raw URL is always shown for long-press copying.
- WhatsApp sharing needs **no phone number** — `wa.me/?text=` lets the seller
  choose the recipient, so a shop with no public contact number can still share.
- Message formats live in `lib/domain/share.ts` (pure, unit-tested) so the link
  can never be dropped from the pasted text.

### Link previews (M5)

Public shop and product pages are server-rendered with complete metadata, so a
crawler that never runs JavaScript still gets everything:

- `og:title` (product **and** shop), `og:description` (price first, then the
  seller's description), `og:url`, `og:site_name`, `og:image` with `:width`,
  `:height` and `:alt`, plus `twitter:card = summary_large_image`.
- `og:image` is the **real cover photo**. Without one it falls back to the shop
  logo; with neither, to a branded 1200×630 card whose alt text says it is a shop
  card — never described as a photo of the product.
- Image dimensions are parsed from the file header at upload time
  (`lib/domain/image-dimensions.ts`: PNG/JPEG/WebP, all three WebP variants) and
  stored on `product_images.width/height`.
- `Product` JSON-LD carries price, currency (`NGN`), availability and images, so
  search engines get machine-readable pricing. Price is *not* emitted as a
  `product:*` meta tag: Next's metadata API renders custom keys as
  `<meta name>`, which is invalid Open Graph syntax, and Facebook retired that
  namespace.
- Metadata is library code (`lib/seo.ts`) with the URL absolutisation in one
  place, so `og:image` is always fetchable and `NEXT_PUBLIC_APP_URL` decides the
  domain. Covers are served from `/media` with a long cache and `nosniff`.
- Missing or draft products return a 404 with `noindex`; the root layout defaults
  to `noindex` and public pages opt back in with `index, follow`. `robots.txt`
  allows storefront routes and disallows the dashboard.

### Public ordering (M6)

A customer opens a shared product link, taps **Order now**, and submits name,
phone, quantity, delivery address and notes — no account, no payment step.

Server-side rules that the form cannot override:

- The **price comes from the database**, never from the submitted form. The total
  is `product.price_kobo × quantity`; the client never sends an amount.
- The seller is derived from the shop slug, and the product must be **published**
  and **available** at submission time — drafts, deleted products and sold-out
  items are refused even if the form was left open on a stale page.
- Quantity is capped at 20, names/phones/addresses are validated, and every new
  order is created as `status=new`, `payment_status=unpaid`, `source=product_link`
  with the product recorded on both the order and its line item.
- Abuse control: a hidden honeypot field, and per-IP limits of 5 attempts per
  15 minutes and 20 per hour, counted from a `public_order_attempts` table. IPs
  are stored only as a **per-day salted hash**.
- Only a **24-byte random token** can open the confirmation page; it shows the
  reference, item, quantity, total and shop — never the customer's own details.
  Bad tokens are a plain 404, and the page is `noindex`.

In production the anonymous path is a `SECURITY DEFINER` Postgres function
(`supabase/migrations/0005_public_orders.sql`) rather than an anon `INSERT` policy,
so RLS stays strict: visitors cannot write to `orders` directly, only through a
function that resolves the product and prices it itself.

The seller sees the order in their normal order list (badge: *Product link*), with
the originating product linked from the order detail page.

### Accounts, marketplace and payment (M9)

**Who can do what.**

| | Visitor (no account) | Customer | Seller |
| --- | --- | --- | --- |
| Browse marketplace, shops, products | ✅ | ✅ | ✅ |
| See prices, photos, shop details | ✅ | ✅ | ✅ |
| Place an order | ❌ → sign in | ✅ | ❌ |
| Upload a payment receipt | via the order's token link | ✅ (`/account`) | ❌ |
| Confirm payment, manage products | ❌ | ❌ | ✅ |

- The landing page (`/`) is a **public marketplace**: shops with published products,
  a few featured items, and search at `/shops`. No account needed to look around.
- Signing up asks **“Buy from shops” or “Sell my products”**. Customers get
  `account_type = 'customer'`, no shop slug (backfill skips them), and are redirected
  away from seller screens; sellers are redirected away from `/account`.
- Placing an order requires a customer session. Anonymous visitors are sent to
  `/login?role=customer&next=…` and returned to the order page afterwards — the
  `next` value is validated to be an internal path only (no open redirect).
- **Sign out** is visible in the seller sidebar *and* in the mobile header, not
  buried inside a menu.

**Getting paid.** Sellers add bank, account name/number and a delivery fee in
*My Shop → Payment details*. After ordering, the customer sees those details on the
confirmation page and in `/account`, transfers the **goods total**, and uploads a
screenshot of the receipt (token-authenticated, or as the signed-in buyer); it is
stored privately in `payment-receipts` and served through the traversal-safe
`/media` route.

The seller sees the receipt on the order, with a **Confirm payment** button that
records the money actually owed. Payment status is still *derived* — nothing is
marked paid automatically.

**Delivery is paid on delivery.** The seller's fee is recorded on the order
(`delivery_fee_kobo`, `delivery_fee_on_delivery = 1`) but excluded from
`amount_due_online_kobo`, so the customer transfers the goods total only and pays
the rider on arrival. Orders without a delivery fee behave exactly as before
(`amount_due_online_kobo` stays null → full total). Balances on the orders,
payments and dashboard screens all use the online amount due.

### Admin, disputes and delivery confirmation (M10)

**Delivery confirmation.** The customer taps “I received this order” from
`/account` or from the order's token link. It is stored on the order
(`orders.received_confirmed_at`) and written to the order timeline, so the seller
sees it on the order page and the admin sees it in a dispute. Confirming twice is
a no-op; cancelled orders cannot be confirmed; only the buyer (or the token
holder) can do it.

**Admin area** (`/admin`, guarded by `requireAdmin` → `role = 'admin'`):

| Page | What it answers |
| --- | --- |
| `/admin` | Visitors today / 7 days / month / year / all time, visits per day, month and year, most-visited pages, commerce totals (pending vs confirmed payments, receipts to review, deliveries confirmed) |
| `/admin/payments` | Every order from every shop, filterable to *pending*, *confirmed* or *with receipts*, searchable by reference, shop, customer or phone |
| `/admin/lookup?ref=OP-XXXX` | The dispute view: both parties' contacts, amounts, the uploaded receipt image, the delivery confirmation and the full timeline |
| `/admin/users` | All sellers (catalogue + collected totals) and all customer accounts |

The admin account is seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults in
`scripts/seed.mjs`) and stored with a scrypt hash — **change the password after the
first login**. Admins are redirected away from seller and customer screens, and
sellers/customers are redirected away from `/admin`.

**Search.** `/search?q=` looks across live shops *and* published products (name and
description); the public header carries the search box on every public page.

**Contact.** `/contact` (also linked from the public header) with phone
`09125172442` (tap-to-call and WhatsApp) and email
`kandcshopping11@gmail.com`, from `lib/contact.ts`.

**Password reset.** `/forgot-password` → single-use token (SHA-256 stored, one
hour, invalidates earlier tokens and all sessions on use) → `/reset-password/<token>`.
No mail provider is configured, so while `ORDERPILOT_SHOW_RESET_LINKS` is not `0`
the link is shown on screen; set it to `0` once email delivery exists. The response
is identical for unknown emails, so it cannot be used to discover accounts.

### Link tracking (M7)

Views are recorded by a **client beacon** (`ProductViewTracker` →
`POST /api/track/view`), not during server render. That single decision keeps the
numbers honest:

- link-preview crawlers (which never run JavaScript) are not counted as visitors;
- Next's prefetching does not inflate views;
- one view per product per browser session, so refreshes and back-navigation do
  not inflate it either.

**Privacy by construction:** no cookies, no raw IP addresses. A visitor is a
salted hash of IP + user agent + **the current day**, so it cannot be reversed and
stops being linkable tomorrow. Only the referrer *host* is kept (`wa.me`), never
the full URL. Rows are pruned after 90 days.

**Source attribution** (`lib/domain/analytics.ts`) maps referrers to WhatsApp,
Instagram, Facebook, X, Telegram, TikTok, search, your own shop, direct and other.
A seller can force an attribution with `?src=instagram`, which wins over the
referrer. Missing referrers are recorded as *direct* — never guessed.

What is deliberately **not** claimed: that a specific person saw a Status. The
dashboard says "views" and "where views came from", with a note that apps strip
referrers, because no authorized integration reports Status viewers.

Sellers see: views / unique visitors / orders / conversion on each product and on
the product edit page (last 30 days), plus a traffic-source breakdown on *Share
Products*. Cancelled orders never count as conversions.

### Security hardening (M8)

- **Headers** (`next.config.ts`): a CSP locked to `'self'` for scripts, styles,
  images and connections (inline script/style is allowed because Next injects
  bootstrap scripts and Tailwind inlines styles), plus `X-Frame-Options: DENY`,
  `nosniff`, `strict-origin-when-cross-origin`, a restrictive
  `Permissions-Policy`, and HSTS. `upgrade-insecure-requests` is intentionally
  omitted so the app still works over plain HTTP locally.
- **Brute-force protection**: sign-in failures are counted per (IP + email) and
  per IP — 10 per 15 minutes and 30 per hour — in `auth_attempts`, keyed by
  daily-salted hashes so the table cannot reveal which emails exist. A successful
  sign-in clears that device's history. The check runs *before* the password, so
  a locked-out client cannot keep guessing.
- **Abuse limits**: public orders keep their honeypot and per-IP limits; product
  views and order attempts are pruned by `pnpm db:prune`.
- **Ownership**: every repository call takes `sellerId`; public reads go through
  narrow projections (`PublicShop`, `PublicProduct`, `PublicOrderView`) that
  cannot include `email`, `owner_name`, customer names, phones or addresses.
  `PublicOrderView` is built by a single query that never selects them.
- **Uploads**: magic-byte validation, 2 MB cap, generated names, `/media` served
  with `nosniff` and a sandboxing CSP; SVG is rejected.
- **Known limits, stated plainly**: no rate limit on sign-up (only sign-in),
  sign-up reveals that an email is taken, `x-forwarded-for` is trusted for IP
  limits (correct behind a proxy, spoofable without one), and CSP still needs
  `'unsafe-inline'` until a nonce pipeline exists.

### Storefront links (M1)

Every seller gets a slug at sign-up (`allocateSlug` from the business name, with
`-2`, `-3` … on collision), so `pnpm db:seed` produces `/shop/mystore-fashion`
without any manual step. `ensureShopSlugs()` backfills accounts created before the
storefront existed, on their next dashboard visit.

- **Rules** live in `lib/domain/slug.ts`: 3–40 chars, lowercase alphanumerics and
  hyphens, must start/end alphanumeric, at least one letter, no `--`, and never a
  reserved word. `RESERVED_SLUGS` covers app routes (`shop`, `orders`, `api`,
  `media`, …), metadata files and brand/legal names.
- **Uniqueness is case-insensitive** and enforced by a partial unique index. A
  slug is also taken if any seller has *ever* used it, so a retired link cannot be
  re-registered by someone else and hijack already-shared URLs.
- **Changing a slug is controlled**: clients must confirm, there is a 24-hour
  cooldown between changes, and the old slug is written to `shop_slug_history`
  inside the same transaction. `/shop/<old>` answers `308 Permanent Redirect` to
  the current link; `/shop/<unknown>` is a normal 404.
- **Uploads** (`lib/storage.ts`) are validated by magic bytes rather than file
  name or browser MIME type, capped at 2 MB, renamed, and served through
  `/media/...` with `nosniff` and an immutable cache header. `resolveMediaPath`
  rejects traversal, and `public/` is never used for user content.

## Testing

`pnpm test` runs twelve suites (142 tests) against one throwaway database; the
suites share a process under `--test-isolation=none` and keep their data apart with
distinct sellers:

- `tests/core.test.mjs` — money maths, password hashing, sign-up/sign-in, phone
  normalisation, duplicate customers, order totals, validation, payment
  progression, status transitions, tenancy isolation, follow-ups.
- `tests/shop.test.mjs` — slug normalisation/rules/reserved words, automatic and
  collision-safe allocation, case-insensitive lookup, public-shape field
  filtering, redirects for retired slugs, cooldown, reclaim prevention, backfill.
- `tests/products.test.mjs` — product slugs, validation, drafts never resolving
  publicly, shop-slug gating, cross-seller isolation, image cap/cover/removal,
  URL allow-list, renames keeping their slug, delete returning image URLs.
- `tests/storage.test.mjs` — image sniffing, size/type rejection, path traversal,
  content-type allow-list, deletion.
- `tests/share.test.mjs` — product/shop URL construction (including the pasted
  link), WhatsApp encoding, copy-details formatting, download file names.
- `tests/seo.test.mjs` — PNG/JPEG/WebP dimension parsing, absolute URLs, preview
  image selection (photo → logo → brand card), Open Graph/Twitter tags, price in
  the description, and JSON-LD including script-tag escaping.
- `tests/public-orders.test.mjs` — anonymous ordering, database-side pricing,
  validation, draft/sold-out refusal, honeypot, per-IP rate limits, token
  uniqueness, and that the confirmation view exposes no personal data.
- `tests/analytics.test.mjs` — referrer-to-source mapping (including ports),
  explicit `?src=` override, visitor-hash irreversibility, published-only
  recording, seller-scoped performance, cancelled-order exclusion, pruning.
- `tests/acceptance.test.mjs` — the spec's acceptance criteria, each named:
  unique shop URLs, working product URLs, correct public content, guest ordering,
  seller dashboard delivery, validation, unpaid-by-default, cross-seller
  isolation, stale-link refusal, no private data on public pages, slug redirects,
  and `seller_id` on every tenant table.
- `tests/auth-throttle.test.mjs` — hashed login keys, lockout after repeated
  failures, per-device isolation, IP-wide spread prevention, pruning.
- `tests/accounts.test.mjs` — customer accounts without shop links, seller payment
  details, delivery fee excluded from the amount due online, receipt upload and
  confirmation, cross-seller confirmation refusal, buyer-only order visibility,
  and customer rows never receiving a slug.

`pnpm acceptance` then proves what only HTTP can: the marketplace and shop pages
load with no cookie, content and prices are right, crawler tags are absolute,
security headers are present, drafts 404, the order form and `/account` require a
customer session (with a safe `next` redirect), the confirmation page hides
customer details and shows the seller's bank details, the seller sees the order and
its receipt section, sign-out is reachable, and the tracking endpoint rejects junk.

Node runs the TypeScript sources directly (type stripping) — `scripts/ts-loader.mjs`
adds the `.ts`/`index.ts` resolution that Next's bundler does for extensionless
imports.
