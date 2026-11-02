import Link from "next/link";
import { BrandLockup } from "../../components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black lg:grid lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-black px-10 py-12 lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-500/10 blur-3xl"
        />
        <Link href="/" className="relative">
          <BrandLockup size="lg" />
        </Link>

        <div className="relative max-w-md">
          <p className="eyebrow">Curated elegance</p>
          <h2 className="display mt-3 text-[34px] leading-tight text-white">
            A marketplace for individual style.
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-white/55">
            Shop independent sellers, or open your own shop and keep every order, customer and payment
            in one place.
          </p>
          <ul className="mt-8 space-y-3 text-[13px] text-white/60">
            {[
              "Track every order from enquiry to delivery",
              "Know who has paid and who is owing",
              "Confirm delivery from either side",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-0.5 text-brand-500" aria-hidden="true">
                  —
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] uppercase tracking-[0.2em] text-white/30">
          K&amp;C Shopping
        </p>
      </div>

      <div className="flex min-h-screen flex-col justify-center bg-canvas px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link href="/">
              <BrandLockup size="sm" />
            </Link>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}