import type { SafeUser } from "../lib/auth/users";
import { PublicHeader } from "./public-header";
import { SiteFooter } from "./site-footer";

/** Shared shell for the editorial pages (about, terms, gift cards, …). */
export function EditorialPage({
  eyebrow,
  title,
  lede,
  user,
  children,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  user?: SafeUser | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black">
      <PublicHeader user={user} />

      <main className="mx-auto max-w-[860px] px-4 py-14 sm:px-6 sm:py-20">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="display mt-3 text-[34px] leading-tight text-white sm:text-[46px]">{title}</h1>
        {lede ? <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/60">{lede}</p> : null}

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-white/70">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}

/** Small heading + body block used inside editorial pages. */
export function EditorialSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-serif text-xl text-white">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
