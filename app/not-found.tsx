import Link from "next/link";
import { BrandLockup } from "../components/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Link href="/" className="mb-8">
        <BrandLockup />
      </Link>
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
        We could not find that page
      </h1>
      <p className="mt-2 max-w-md text-sm text-ink-500">
        The link may be out of date, or the item may have been removed.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/dashboard" className="btn-primary">
          Go to dashboard
        </Link>
        <Link href="/login" className="btn-secondary">
          Sign in
        </Link>
      </div>
    </div>
  );
}
