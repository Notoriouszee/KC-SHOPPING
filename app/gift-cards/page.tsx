import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/session";
import { EditorialPage, EditorialSection } from "../../components/editorial-page";

export const metadata: Metadata = {
  title: "Gift Cards",
  description: "K&C Shopping gift cards — coming soon.",
};

export default async function GiftCardsPage() {
  const user = await getCurrentUser();

  return (
    <EditorialPage
      user={user}
      eyebrow="Gift cards"
      title="Give the choice, not the guess."
      lede="A K&C gift card lets someone pick the piece they actually want, from any shop on the marketplace."
    >
      <div className="rounded-md border border-line bg-surface-2 p-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">Coming soon</p>
        <p className="mt-2 text-white/70">
          Gift cards are not on sale yet. In the meantime, you can order any piece in a shop and have
          it delivered to the person you are buying for — just put their address at checkout.
        </p>
        <Link href="/collections" className="btn-primary mt-5">
          Browse the collection
        </Link>
      </div>

      <EditorialSection title="Want to be told first?">
        <p>
          Message us from the{" "}
          <Link href="/contact" className="text-white underline underline-offset-4">
            contact page
          </Link>{" "}
          and we will let you know the moment gift cards go live.
        </p>
      </EditorialSection>
    </EditorialPage>
  );
}
