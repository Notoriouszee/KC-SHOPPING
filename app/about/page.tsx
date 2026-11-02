import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/session";
import { EditorialPage, EditorialSection } from "../../components/editorial-page";

export const metadata: Metadata = {
  title: "Our Story",
  description: "Why K&C Shopping exists: a curated marketplace for individual style.",
};

export default async function AboutPage() {
  const user = await getCurrentUser();

  return (
    <EditorialPage
      user={user}
      eyebrow="Our story"
      title="Curated, not crowded."
      lede="K&C Shopping brings together independent shops with a point of view. We do not aim to list everything — only pieces worth wearing and people worth buying from."
    >
      <EditorialSection title="Why we started">
        <p>
          Shopping online in Nigeria usually means endless group chats, screenshots and “is this still
          available?”. Good shops get buried, and buyers cannot tell who is real. K&amp;C is a
          different kind of marketplace: every seller has a shop of their own, with real prices, real
          photos and a track record you can see.
        </p>
      </EditorialSection>

      <EditorialSection title="How it works">
        <p>
          Browse the shops and the pieces. When something is right, create a customer account and
          place the order. You pay the shop directly by transfer, upload your receipt, and the seller
          confirms it. Once the item is in your hands, you confirm delivery — so both sides have a
          record if anything goes wrong.
        </p>
      </EditorialSection>

      <EditorialSection title="For sellers">
        <p>
          Opening a shop takes a minute. You get your own link to share on WhatsApp, Instagram or
          Facebook, a product catalogue with photos, and an order book that shows who has paid and who
          is still owing.
        </p>
        <p>
          <Link href="/signup?role=seller" className="text-white underline underline-offset-4">
            Open your shop →
          </Link>
        </p>
      </EditorialSection>

      <EditorialSection title="Talk to us">
        <p>
          Questions, a dispute, or a shop you think we should know about?{" "}
          <Link href="/contact" className="text-white underline underline-offset-4">
            Contact us
          </Link>{" "}
          — a real person reads every message.
        </p>
      </EditorialSection>
    </EditorialPage>
  );
}
