"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Counts one visit per page per browser session.
 *
 * Runs in an effect so server-rendered pages and crawlers are never counted, and
 * uses `sessionStorage` so a refresh does not inflate the numbers.
 */
export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/api/")) return;

    const key = `op:visit:${pathname}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode without storage: still count, just without de-duplication.
    }

    const payload = JSON.stringify({ path: pathname });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track/visit", new Blob([payload], { type: "application/json" }));
      return;
    }

    void fetch("/api/track/visit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
