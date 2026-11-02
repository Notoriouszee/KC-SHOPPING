import type { Metadata } from "next";
import { getCurrentUser } from "../../lib/auth/session";
import { SUPPORT_EMAIL } from "../../lib/contact";
import { EditorialPage, EditorialSection } from "../../components/editorial-page";

export const metadata: Metadata = { title: "Privacy Policy" };

export default async function PrivacyPage() {
  const user = await getCurrentUser();

  return (
    <EditorialPage
      user={user}
      eyebrow="Legal"
      title="Privacy Policy"
      lede="We collect what an order needs and very little else. No advertising trackers, no selling data, no third-party pixels."
    >
      <EditorialSection title="What we collect">
        <p>
          Account details (name, email, phone), your orders, the delivery address you give the seller,
          and the payment receipts you upload. Sellers see the details of their own orders only.
        </p>
      </EditorialSection>

      <EditorialSection title="Visitor counts">
        <p>
          We count page visits without cookies. The count uses an irreversible hash of your IP
          address, browser and the current day — it cannot be linked back to you, and tomorrow it is
          meaningless.
        </p>
      </EditorialSection>

      <EditorialSection title="Payments">
        <p>
          Money moves directly between you and the seller by bank transfer. K&amp;C does not hold your
          card or bank credentials. Payment receipts are stored privately and shown only to the seller
          of that order and, for dispute resolution, to platform administrators.
        </p>
      </EditorialSection>

      <EditorialSection title="Your choices">
        <p>
          You can ask us to correct or delete your account by writing to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>
          . Orders that are part of an open dispute may be kept until it is resolved.
        </p>
      </EditorialSection>
    </EditorialPage>
  );
}
