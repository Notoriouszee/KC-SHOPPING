import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "../../../../lib/auth/session";
import { listCustomers } from "../../../../lib/repositories/customers";
import { NewOrderForm } from "../../../../components/new-order-form";
import { PageHeader } from "../../../../components/ui";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage() {
  const user = await requireUser();
  const customers = listCustomers(user.id, { limit: 300 }).map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
  }));

  return (
    <div>
      <PageHeader
        title="New order"
        description="Record an order you took over WhatsApp, in person or on a call."
        action={
          <Link href="/orders" className="btn-secondary">
            Cancel
          </Link>
        }
      />
      <NewOrderForm customers={customers} />
    </div>
  );
}
