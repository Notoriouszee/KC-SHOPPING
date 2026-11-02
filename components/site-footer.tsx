import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "../lib/contact";

const links = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/affiliate", label: "Affiliate Program" },
  { href: "/sell", label: "Shop on K&C (Seller Portal)" },
  { href: "/contact", label: "Contact Us" },
];

/** Footer used across the public marketplace. */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-black">
      <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/70 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="mt-6 text-center text-[12px] text-white/45">
          A curated marketplace for individual style
        </p>

        <p className="mt-2 text-center text-[12px] text-white/35">
          <a href={`tel:${SUPPORT_PHONE}`} className="hover:text-white/70">
            {SUPPORT_PHONE}
          </a>{" "}
          ·{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-white/70">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </footer>
  );
}
