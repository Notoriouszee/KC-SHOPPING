import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/session";
import { EditorialPage, EditorialSection } from "../../components/editorial-page";

export const metadata: Metadata = {
  title: "Shop on K&C — Seller Portal",
  description: "Open your shop on K&C Shopping and manage orders, products and payments.",
};

export default async function SellPage() {
  const user = await getCurrentUser();
  const sellerHome = user?.role === "admin" ? "/admin" : user?.account_type === "seller" ? "/dashboard" : null;

  return (
    <EditorialPage
      user={user}
      eyebrow="Seller portal"
      title="Your shop, your link, your orders."
      lede="K&C gives every seller a storefront of their own and an order book that shows what has been paid, what is outstanding and what needs a follow-up."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: "A shop link",
            body: "A clean URL to share on WhatsApp, Instagram or Facebook — with photo previews that show the real product.",
          },
          {
            title: "An order book",
            body: "Enquiries, orders, payment status, receipts and follow-ups in one list instead of a notebook.",
          },
          {
            title: "Payment clarity",
            body: "Customers transfer to your account, upload a receipt, and you confirm it. Every order keeps its record.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-md border border-line bg-surface-2 p-5">
            <h2 className="font-serif text-lg text-white">{item.title}</h2>
            <p className="mt-2 text-sm text-white/60">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        {sellerHome ? (
          <Link href={sellerHome} className="btn-primary">
            Go to my shop
          </Link>
        ) : (
          <Link href="/signup?role=seller" className="btn-primary">
            Open a shop
          </Link>
        )}
        <Link href="/contact" className="btn-secondary">
          Talk to us
        </Link>
      </div>

      <EditorialSection title="What it costs">
        <p>
          Nothing to open a shop. You keep your prices; buyers pay you directly. Commission, once it is
          introduced, will be announced in advance to every seller.
        </p>
      </EditorialSection>

      <EditorialSection title="Getting set up">
        <p>
          Create a seller account, add your shop name, a logo and your bank details, then publish your
          first products. Orders placed through your link land straight in your dashboard, and you can
          confirm payment from the order page once the transfer arrives.
        </p>
      </EditorialSection>
    </EditorialPage>
  );
}
