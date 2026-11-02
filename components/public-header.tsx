import Link from "next/link";
import type { SafeUser } from "../lib/auth/users";
import { BrandLockup } from "./brand";
import { VisitTracker } from "./visit-tracker";

const primaryNav = [
  { href: "/shops", label: "Shop All" },
  { href: "/collections", label: "Collections" },
  { href: "/about", label: "Our Story" },
  { href: "/shops?featured=1", label: "Featured Shops" },
  { href: "/gift-cards", label: "Gift Cards" },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="none">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" fill="none">
      <path d="M5 8h14l-1 12H6L5 8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

/** Header for the public marketplace, styled like a fashion house. */
export function PublicHeader({ user }: { user?: SafeUser | null }) {
  const home = user
    ? user.role === "admin"
      ? "/admin"
      : user.account_type === "customer"
        ? "/account"
        : "/dashboard"
    : null;

  return (
    <header className="border-b border-line bg-black">
      <VisitTracker />

      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-6 px-4 py-4 sm:px-6">
        <Link href="/" aria-label="K&C Shopping home">
          <BrandLockup size="md" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {primaryNav.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/80 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4 border-l border-white/15 pl-4">
          {home ? (
            <Link
              href={home}
              className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/80 hover:text-white"
            >
              {user?.role === "admin"
                ? "Admin"
                : user?.account_type === "customer"
                  ? "My Orders"
                  : "Dashboard"}
            </Link>
          ) : (
            <Link
              href="/login"
              className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/80 hover:text-white"
            >
              Account
            </Link>
          )}

          <Link href="/search" aria-label="Search" className="text-white/80 hover:text-white">
            <SearchIcon />
          </Link>
          <Link href="/account" aria-label="Your orders" className="text-white/80 hover:text-white">
            <BagIcon />
          </Link>
        </div>
      </div>

      {/* Mobile: the primary nav becomes a scrollable row. */}
      <nav
        aria-label="Main"
        className="flex gap-6 overflow-x-auto border-t border-white/10 px-4 py-2.5 sm:px-6 lg:hidden"
      >
        {primaryNav.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.18em] text-white/70"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
