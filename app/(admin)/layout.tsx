import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { logoutAction } from "../../lib/actions/auth";
import { BrandLockup } from "../../components/brand";

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/lookup", label: "Find reference" },
  { href: "/admin/users", label: "Users" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fadmin");
  if (user.role !== "admin") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-line bg-black text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-surface/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-white/80">
              Admin
            </span>
            <Link href="/admin" className="text-white">
              <BrandLockup />
            </Link>
          </div>

          <nav className="flex flex-wrap items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-surface/10 hover:text-white"
              >
                {link.label}
              </Link>
            ))}

            <Link href="/" className="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-surface/10 hover:text-white">
              View site
            </Link>
            <form action={logoutAction} className="ml-1">
              <button
                type="submit"
                className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium text-white hover:bg-surface/10"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-10">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-ink-500">
        Signed in as {user.email} · Admin actions are logged against this account.
      </footer>
    </div>
  );
}
