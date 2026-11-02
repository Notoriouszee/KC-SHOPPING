import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/session";
import { SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_WHATSAPP } from "../../lib/contact";
import { PublicHeader } from "../../components/public-header";
import { SiteFooter } from "../../components/site-footer";

export const metadata: Metadata = {
  title: "Contact us",
  description: "How to reach the K&C Shopping team.",
};

export default async function ContactPage() {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen bg-black">
      <PublicHeader user={user} />

      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Contact us</h1>
        <p className="mt-1.5 text-sm text-ink-600">
          Questions about an order, a payment, or your account? Reach the K&C Shopping team directly.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <a
            href={`tel:${SUPPORT_PHONE}`}
            className="card block p-5 transition-shadow hover:shadow-card"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Phone</p>
            <p className="mt-1 text-lg font-semibold text-ink-900">{SUPPORT_PHONE}</p>
            <p className="mt-1 text-sm text-brand-700">Tap to call →</p>
          </a>

          <a
            href={`https://wa.me/${SUPPORT_WHATSAPP}`}
            target="_blank"
            rel="noreferrer"
            className="card block p-5 transition-shadow hover:shadow-card"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">WhatsApp</p>
            <p className="mt-1 text-lg font-semibold text-ink-900">{SUPPORT_PHONE}</p>
            <p className="mt-1 text-sm text-brand-700">Start a chat →</p>
          </a>

          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="card block p-5 transition-shadow hover:shadow-card sm:col-span-2"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Email</p>
            <p className="mt-1 break-all text-lg font-semibold text-ink-900">{SUPPORT_EMAIL}</p>
            <p className="mt-1 text-sm text-brand-700">Send an email →</p>
          </a>
        </div>

        <section className="card mt-6 p-5 text-sm text-ink-600">
          <h2 className="text-base font-semibold text-ink-900">Before you write to us</h2>
          <ul className="mt-2 space-y-1.5">
            <li>
              • For a payment dispute, include your <strong>order reference</strong> (it starts with
              <code className="mx-1 rounded bg-slate-100 px-1">OP-</code>) — we can look it up
              immediately.
            </li>
            <li>• Sellers: manage orders from your dashboard; customers: see orders under “My orders”.</li>
            <li>• We reply during business hours, and WhatsApp is usually fastest.</li>
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/" className="btn-secondary">
              Browse shops
            </Link>
            <Link href="/login" className="btn-ghost text-brand-700">
              Log in
            </Link>
          </div>
        </section>

      </main>

      <SiteFooter />
    </div>
  );
}
