import type { ReactNode } from "react";
import type { Tone } from "../lib/domain/status";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-ink-700 ring-slate-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description ? <p className="max-w-md text-sm text-ink-500">{description}</p> : null}
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  const accent: Record<Tone, string> = {
    neutral: "text-ink-900",
    info: "text-sky-700",
    warn: "text-amber-700",
    success: "text-emerald-700",
    danger: "text-rose-700",
  };
  return (
    <div className="card p-5">
      <p className="text-sm font-medium text-ink-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${accent[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-sm text-rose-600">{error}</p> : null}
      {!error && hint ? <p className="mt-1.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "danger" | "warn";
  children: ReactNode;
}) {
  const classes: Record<string, string> = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    danger: "border-rose-200 bg-rose-50 text-rose-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${classes[tone]}`} role="status">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
