"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fileNameForProduct,
  nativeSharePayload,
  productDetailsText,
  shareTextWithLink,
  whatsappShareUrl,
} from "../lib/domain/share";

export type ShareableProduct = {
  name: string;
  priceLabel: string;
  url: string;
  imageUrl: string | null;
  shopName: string;
  description: string | null;
  available: boolean;
};

type Variant = "primary" | "secondary" | "compact";

type Status = { tone: "ok" | "warn" | "error"; message: string } | null;

const SHARE_GUIDE = [
  {
    platform: "WhatsApp Status",
    steps: [
      "Open WhatsApp → Status → My status.",
      "Pick the product photo, or start a text status.",
      "Paste the copied link, then post.",
    ],
    note: "WhatsApp does not let another app publish a Status for you — this takes three taps.",
  },
  {
    platform: "Instagram Stories",
    steps: [
      "Add the product photo to your Story.",
      "Tap the link sticker, then paste the link.",
      "Post the Story.",
    ],
    note: "The link sticker is the only way to make a Story link tappable.",
  },
  {
    platform: "Facebook / X / others",
    steps: ["Copy the link, then paste it into a post or message."],
    note: "A preview card appears when the platform reads your product page.",
  },
];

/**
 * Share sheet for a published product.
 *
 * The Web Share API is used when the device supports it, including sharing the
 * product photo as a file where the browser allows it. Everything degrades to
 * clipboard + explicit instructions, because no web page can post to WhatsApp
 * Status or Instagram Stories on the user's behalf.
 */
export function ShareProductButton({
  product,
  variant = "primary",
  label = "Share product",
  showIcon = true,
}: {
  product: ShareableProduct;
  variant?: Variant;
  label?: string;
  showIcon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // Capability is detected after mount: reading `navigator` during render would
  // produce different markup on the server and the client (hydration mismatch).
  const [supportsNativeShare, setSupportsNativeShare] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSupportsNativeShare(typeof navigator !== "undefined" && "share" in navigator);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setStatus(null);
    setShowGuide(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  const copyToClipboard = async (text: string): Promise<boolean> => {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fall through
      }
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopyLink = async () => {
    const ok = await copyToClipboard(product.url);
    setStatus(
      ok
        ? { tone: "ok", message: "Product link copied. Paste it in your Status, Story or post." }
        : { tone: "error", message: "Could not copy automatically — select the link below instead." },
    );
  };

  const handleCopyDetails = async () => {
    const details = productDetailsText(product);

    const ok = await copyToClipboard(details);
    setStatus(
      ok
        ? { tone: "ok", message: "Product details copied — ready to paste anywhere." }
        : { tone: "error", message: "Could not copy automatically. Select the text below instead." },
    );
  };

  const handleWhatsApp = async () => {
    const text = shareTextWithLink(product);
    // Copy first: WhatsApp's own share sheet is the most reliable route to a
    // Status on mobile, and the clipboard is the fallback if it is not.
    await copyToClipboard(text);
    window.open(whatsappShareUrl(product), "_blank", "noopener");
    setStatus({
      tone: "ok",
      message:
        "WhatsApp opened with your message. Choose a chat, or tap Share → My status inside WhatsApp.",
    });
  };

  const buildImageFile = async (): Promise<File | null> => {
    if (!product.imageUrl) return null;
    try {
      const response = await fetch(product.imageUrl);
      if (!response.ok) return null;
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) return null;
      const extension = blob.type.split("/")[1]?.split("+")[0] || "png";
      return new File([blob], fileNameForProduct(product.name, blob.type), { type: blob.type });
    } catch {
      return null;
    }
  };

  const handleNativeShare = async () => {
    setSharing(true);
    try {
      if (!navigator.share) {
        await handleCopyLink();
        setStatus({
          tone: "warn",
          message:
            "This browser has no share menu. The link is copied — paste it in the app you want to use.",
        });
        return;
      }

      const data: ShareData = { ...nativeSharePayload(product) };

      const file = await buildImageFile();
      if (file && navigator.canShare?.({ files: [file] })) {
        data.files = [file];
      }

      await navigator.share(data);
      setStatus({ tone: "ok", message: "Shared." });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        // The user closed the share sheet; that is not an error.
        setStatus(null);
      } else {
        setStatus({
          tone: "warn",
          message: "The share menu could not open. Copy the link and paste it instead.",
        });
      }
    } finally {
      setSharing(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!product.imageUrl) return;
    setDownloading(true);
    try {
      const response = await fetch(product.imageUrl);
      if (!response.ok) throw new Error("fetch failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileNameForProduct(product.name, blob.type);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setStatus({
        tone: "ok",
        message:
          "Photo saved to your device. In WhatsApp Status, pick it from your gallery, then paste the link.",
      });
    } catch {
      setStatus({
        tone: "error",
        message:
          "Could not download the photo. Press and hold it on the product page and choose Save image.",
      });
    } finally {
      setDownloading(false);
    }
  };

  const triggerClass =
    variant === "primary"
      ? "btn-primary"
      : variant === "secondary"
        ? "btn-secondary"
        : "rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-slate-50";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClass}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {showIcon ? <span aria-hidden="true">↗</span> : null}
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Close share options"
            className="absolute inset-0 bg-ink-900/50"
            onClick={close}
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="share-title" className="text-base font-semibold text-ink-900">
                  Share this product
                </h2>
                <p className="mt-0.5 truncate text-xs text-ink-500">
                  {product.name} · {product.priceLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-ink-500 hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {status ? (
              <div
                role="status"
                className={`mt-3 rounded-xl px-3 py-2 text-sm ${
                  status.tone === "ok"
                    ? "bg-emerald-50 text-emerald-800"
                    : status.tone === "warn"
                      ? "bg-amber-50 text-amber-900"
                      : "bg-rose-50 text-rose-800"
                }`}
              >
                {status.message}
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={handleWhatsApp}
                className="flex w-full items-center gap-3 rounded-xl bg-[#25D366] px-4 py-3 text-left text-sm font-semibold text-white hover:brightness-95"
              >
                <span aria-hidden="true" className="text-lg">
                  ◗
                </span>
                Share to WhatsApp
                <span className="ml-auto text-xs font-normal opacity-90">chat or status</span>
              </button>

              <button
                type="button"
                onClick={handleNativeShare}
                disabled={sharing}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-ink-900 hover:bg-slate-50 disabled:opacity-60"
              >
                <span aria-hidden="true" className="text-lg">
                  ↗
                </span>
                {sharing ? "Opening share menu…" : "More sharing options"}
                <span className="ml-auto text-xs font-normal text-ink-500">
                  {supportsNativeShare ? "device menu" : "copy instead"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-ink-900 hover:bg-slate-50"
              >
                <span aria-hidden="true" className="text-lg">
                  ⧉
                </span>
                Copy product link
              </button>

              <button
                type="button"
                onClick={handleCopyDetails}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-ink-900 hover:bg-slate-50"
              >
                <span aria-hidden="true" className="text-lg">
                  ▤
                </span>
                Copy product details
                <span className="ml-auto text-xs font-normal text-ink-500">name, price, link</span>
              </button>

              {product.imageUrl ? (
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  disabled={downloading}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-ink-900 hover:bg-slate-50 disabled:opacity-60"
                >
                  <span aria-hidden="true" className="text-lg">
                    ⤓
                  </span>
                  {downloading ? "Saving photo…" : "Download product photo"}
                </button>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2">
              <p className="break-all font-mono text-[11px] text-ink-700">{product.url}</p>
              <p className="mt-1 text-[11px] text-ink-500">
                Tap the link to select it if copying is blocked.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide((value) => !value)}
              className="mt-3 text-xs font-semibold text-brand-700 hover:underline"
              aria-expanded={showGuide}
            >
              {showGuide ? "Hide" : "How do I post this to"} WhatsApp Status or Instagram Stories?
            </button>

            {showGuide ? (
              <div className="mt-3 space-y-3">
                {SHARE_GUIDE.map((guide) => (
                  <div key={guide.platform} className="rounded-xl border border-slate-200 px-3 py-2.5">
                    <p className="text-xs font-semibold text-ink-900">{guide.platform}</p>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-ink-700">
                      {guide.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    <p className="mt-1.5 text-[11px] text-ink-500">{guide.note}</p>
                  </div>
                ))}
                <p className="text-[11px] leading-relaxed text-ink-500">
                  K&C Shopping cannot post to your Status or Stories for you, and cannot guarantee the
                  platform shows a photo or a clickable link. The product link always opens the
                  correct page.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
