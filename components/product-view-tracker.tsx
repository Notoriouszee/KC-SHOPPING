"use client";

import { useEffect } from "react";

/**
 * Fires one view per product per browser session.
 *
 * A client beacon (rather than recording server-side during render) keeps link
 * previews, prefetches and refreshes from inflating a seller's numbers.
 */
export function ProductViewTracker({
  productId,
  src,
}: {
  productId: string;
  /** Optional `?src=` tag, e.g. a campaign the seller shared. */
  src?: string | null;
}) {
  useEffect(() => {
    if (!productId) return;

    const storageKey = `op:viewed:${productId}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Private mode can throw; counting the view is still fine.
    }

    const payload = JSON.stringify({
      productId,
      src: src ?? null,
      referrer: document.referrer || null,
    });

    void fetch("/api/track/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Analytics must never affect the page.
    });
  }, [productId, src]);

  return null;
}
