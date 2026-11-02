import type { Metadata } from "next";
import { getCurrentUser } from "../../lib/auth/session";
import { SUPPORT_EMAIL } from "../../lib/contact";
import { EditorialPage, EditorialSection } from "../../components/editorial-page";

export const metadata: Metadata = { title: "Terms of Service" };

export default async function TermsPage() {
  const user = await getCurrentUser();

  return (
    <EditorialPage
      user={user}
      eyebrow="Legal"
      title="Terms of Service"
      lede="The short version: K&C introduces buyers and sellers, the seller is responsible for the goods, and we help when something goes wrong."
    >
      <EditorialSection title="1. What K&C is">
        <p>
          K&amp;C Shopping is a marketplace. Each shop is run by an independent seller who sets their
          own prices, stock and delivery terms. K&amp;C provides the storefront, the order record and
          the payment-confirmation workflow.
        </p>
      </EditorialSection>

      <EditorialSection title="2. Orders and payment">
        <p>
          An order is a contract between you and the seller. You pay the goods total by bank transfer
          to the account the shop shows you, then upload your receipt. The seller confirms the
          payment. Delivery fees, where charged, are shown before you order and are paid on delivery
          unless the shop says otherwise.
        </p>
      </EditorialSection>

      <EditorialSection title="3. Delivery and confirmation">
        <p>
          When your order arrives, confirm it from your account or the order link. That record is what
          we use if there is a dispute about whether an item was received.
        </p>
      </EditorialSection>

      <EditorialSection title="4. Disputes">
        <p>
          If an item does not arrive, arrives damaged, or is not what was described, contact the
          seller first, then{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>{" "}
          with your order reference. We keep the order timeline and the payment receipt so a dispute
          can be reviewed against the record.
        </p>
      </EditorialSection>

      <EditorialSection title="5. Accounts">
        <p>
          You are responsible for your password and for activity on your account. Sellers must keep
          their product listings, prices and bank details accurate. We may suspend an account that
          repeatedly fails to deliver or misrepresents its goods.
        </p>
      </EditorialSection>

      <EditorialSection title="6. Changes">
        <p>
          We may update these terms as the marketplace develops; the current version always lives at
          this address.
        </p>
      </EditorialSection>
    </EditorialPage>
  );
}
