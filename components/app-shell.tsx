"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLockup } from "./brand";

export type NavItem = {
  href: string;
  label: string;
  /** Short glyph used in the collapsed mobile rail. */
  icon: string;
  /** Optional count pill, e.g. open orders. */
  badge?: number;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export function AppShell({
  businessName,
  ownerName,
  groups,
  signOut,
  children,
}: {
  businessName: string;
  ownerName: string;
  groups: NavGroup[];
  signOut: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));

  const nav = (
    <nav className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.title}>
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-500">
            {group.title}
          </p>
          <ul className="mt-2 space-y-1">
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-white text-black"
                        : "text-ink-700 hover:bg-white/5 hover:text-ink-900"
                    }`}
                  >
                    <span aria-hidden="true" className="w-5 text-center text-base">
                      {item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {typeof item.badge === "number" && item.badge > 0 ? (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-semibold ${
                          active ? "bg-black text-white" : "bg-white text-black"
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-line bg-surface px-4 py-5 lg:flex">
        <div>
          <Link href="/dashboard" className="mb-7 flex px-2">
            <BrandLockup />
          </Link>
          {nav}
        </div>
        <div className="border-t border-line px-1 pt-4">
          <p className="truncate text-sm font-medium text-ink-900">{businessName}</p>
          <p className="truncate text-[11px] uppercase tracking-[0.14em] text-ink-500">{ownerName}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          One bar across the top on every screen size. Sign out lives here — above
          the page — instead of at the bottom of the sidebar.
        */}
        <header className="sticky top-0 z-30 border-b border-line bg-black/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/dashboard" className="lg:hidden">
                <BrandLockup size="sm" />
              </Link>
              <p className="hidden truncate text-[11px] uppercase tracking-[0.16em] text-ink-500 sm:block">
                {businessName}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {signOut}
              <button
                type="button"
                onClick={() => setMobileOpen((open) => !open)}
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav"
                className="btn-secondary px-3 py-1.5 lg:hidden"
              >
                <span className="sr-only">Toggle navigation</span>
                <span aria-hidden="true">{mobileOpen ? "\u2715" : "\u2630"}</span>
              </button>
            </div>
          </div>
        </header>

        {mobileOpen ? (
          <div id="mobile-nav" className="border-b border-line bg-surface px-4 py-4 lg:hidden">
            {nav}
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
