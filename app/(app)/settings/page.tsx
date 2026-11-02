import type { Metadata } from "next";
import { requireUser } from "../../../lib/auth/session";
import { formatDate } from "../../../lib/domain/dates";
import { ProfileForm } from "../../../components/profile-form";
import { Card, CardHeader, PageHeader } from "../../../components/ui";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div>
      <PageHeader title="Settings" description="Your account and business details." />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Business profile" description="Used across your dashboard." />
          <div className="px-5 py-5">
            <ProfileForm
              ownerName={user.owner_name}
              businessName={user.business_name}
              phone={user.phone}
              email={user.email}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Account" />
          <dl className="space-y-3 px-5 py-4 text-sm">
            <div>
              <dt className="text-ink-500">Member since</dt>
              <dd className="font-medium text-ink-900">{formatDate(user.created_at)}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Role</dt>
              <dd className="font-medium capitalize text-ink-900">{user.role}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Account ID</dt>
              <dd className="break-all font-mono text-xs text-ink-500">{user.id}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
