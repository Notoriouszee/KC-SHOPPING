import Link from "next/link";
import { requireCustomer } from "../../lib/auth/session";
import { logoutAction } from "../../lib/actions/auth";
import { BrandLockup } from "../../components/brand";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="shrink-0">
            <BrandLockup />
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/shops"
              className="hidden text-sm font-medium text-ink-600 hover:text-ink-900 sm:block"
            >
              Browse shops
            </Link>
            <span className="hidden max-w-[160px] truncate text-sm text-ink-500 sm:block">
              {user.owner_name}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="btn-secondary px-3 py-1.5 text-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
