import Image from "next/image";

/**
 * K&C Shopping brand.
 *
 * The mark is the supplied gold artwork, cut out of its white background so it
 * sits on the black canvas. `BrandLockup` keeps the same footprint everywhere, so
 * replacing the artwork later is a one-file change.
 */
export function BrandLockup({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const widths = { sm: 96, md: 132, lg: 180 };
  const width = widths[size];

  return (
    <span className={`inline-flex items-center ${className}`}>
      <Image
        src="/brand/kc-logo-header.png"
        alt="K&C Shopping"
        width={width}
        height={Math.round((width / 363) * 160)}
        priority
        style={{ width, height: "auto" }}
        className="h-auto w-auto"
      />
      <span className="sr-only">K&amp;C Shopping</span>
    </span>
  );
}

/** Compact mark, for favicons and tight spaces. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center ${className}`}>
      <Image src="/brand/kc-logo.png" alt="" width={40} height={18} className="h-auto w-10" />
    </span>
  );
}
