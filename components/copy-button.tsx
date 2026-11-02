"use client";

import { useState } from "react";

type Props = {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  /** Renders a compact icon-ish button when true. */
  compact?: boolean;
};

/**
 * Copies text to the clipboard with a Web Share/clipboard fallback chain.
 *
 * `navigator.clipboard` is unavailable on insecure origins and in some in-app
 * browsers (common on mobile), so a hidden textarea + execCommand path is kept
 * as a last resort.
 */
export function CopyButton({
  value,
  label = "Copy link",
  copiedLabel = "Copied!",
  className = "btn-secondary",
  compact = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    setFailed(false);

    const legacyCopy = () => {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.top = "-1000px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
      } catch {
        return false;
      }
    };

    let ok = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        ok = true;
      } catch {
        ok = legacyCopy();
      }
    } else {
      ok = legacyCopy();
    }

    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } else {
      setFailed(true);
      window.setTimeout(() => setFailed(false), 4000);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={copy}
        className={`${className} ${compact ? "px-3" : ""}`}
        aria-live="polite"
      >
        <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
        {copied ? copiedLabel : label}
      </button>
      {failed ? (
        <span className="text-xs text-rose-600" role="status">
          Could not copy — press and hold the link to copy it.
        </span>
      ) : null}
    </span>
  );
}
