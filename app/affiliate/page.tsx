import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth/session";
import { SUPPORT_EMAIL } from "../../lib/contact";
import { EditorialPage, EditorialSection } from "../../components/editorial-page";

export const metadata: Metadata = { title: "Affiliate Program" };

export default async function AffiliatePage() {
  const user = await getCurrentUser();

  return (
    <EditorialPage
      user={user}
      eyebrow="Partners"
      title="Affiliate Program"
      lede="If you send buyers to a K&C shop, you should share in the sale. Here is how the programme will work."
    >
      <EditorialSection title="How it works">
        <p>
          Apply for an affiliate code, share shop and product links with it attached, and earn a
          commission on orders that come from your link. Every shop link already carries tracking, so
          attribution is measured from the visit through to the order.
        </p>
      </EditorialSection>

      <EditorialSection title="Status">
        <p>
          The programme is being finalised. Commission rates, payout thresholds and the reporting
          dashboard are not live yet, so we are not accepting new affiliates at this moment.
        </p>
      </EditorialSection>

      <EditorialSection title="Register interest">
        <p>
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>{" "}
          with a line about your audience and we will reply when the programme opens.
        </p>
        <p>
          Shop owner instead?{" "}
          <Link href="/sell" className="text-white underline underline-offset-4">
            Open a shop
          </Link>
          .
        </p>
      </EditorialSection>
    </EditorialPage>
  );
}
