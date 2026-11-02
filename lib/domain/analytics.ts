/**
 * Where a product visit came from.
 *
 * Sharing happens in apps whose referrer is often stripped entirely, so this is
 * best-effort attribution — never a claim about who saw what. A missing referrer
 * is recorded as "direct", not invented.
 */

export const VIEW_SOURCES = [
  "whatsapp",
  "instagram",
  "facebook",
  "x",
  "telegram",
  "tiktok",
  "search",
  "shop",
  "direct",
  "other",
] as const;

export type ViewSource = (typeof VIEW_SOURCES)[number];

export const SOURCE_LABELS: Record<ViewSource, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  telegram: "Telegram",
  tiktok: "TikTok",
  search: "Search",
  shop: "Your shop",
  direct: "Direct",
  other: "Other",
};

const HOST_MAP: { match: RegExp; source: ViewSource }[] = [
  { match: /(^|\.)wa\.me$|(^|\.)whatsapp\.com$/, source: "whatsapp" },
  { match: /(^|\.)instagram\.com$|(^|\.)cdninstagram\.com$/, source: "instagram" },
  { match: /(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/, source: "facebook" },
  { match: /(^|\.)twitter\.com$|(^|\.)x\.com$|(^|\.)t\.co$/, source: "x" },
  { match: /(^|\.)t\.me$|(^|\.)telegram\.(org|me)$/, source: "telegram" },
  { match: /(^|\.)tiktok\.com$/, source: "tiktok" },
  {
    match: /(^|\.)google\.[a-z.]+$|(^|\.)bing\.com$|(^|\.)duckduckgo\.com$|(^|\.)yahoo\.com$/,
    source: "search",
  },
];

export type ClassifiedVisit = { source: ViewSource; referrerHost: string | null };

function normaliseHost(host: string): string {
  // Strip a port (`localhost:3000`) and any leading www. so same-origin checks
  // compare like with like.
  return host.toLowerCase().split(":")[0].replace(/^www\./, "").slice(0, 100);
}

/** Maps a referrer URL or host onto a known source. */
export function classifyReferrerHost(
  referrer: string | null | undefined,
  siteHost?: string | null,
): ClassifiedVisit {
  if (!referrer) return { source: "direct", referrerHost: null };

  let host: string;
  try {
    host = new URL(referrer).hostname;
  } catch {
    // A bare host like "wa.me" is acceptable too.
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(referrer)) host = referrer;
    else return { source: "direct", referrerHost: null };
  }

  const clean = normaliseHost(host);
  if (!clean) return { source: "direct", referrerHost: null };

  if (siteHost && normaliseHost(siteHost) === clean) {
    return { source: "shop", referrerHost: clean };
  }

  for (const entry of HOST_MAP) {
    if (entry.match.test(clean)) return { source: entry.source, referrerHost: clean };
  }

  return { source: "other", referrerHost: clean };
}

/**
 * Combines an explicit `?src=` tag with the referrer. An explicit, known tag
 * wins because it is the only thing a seller can control deliberately.
 */
export function classifyViewSource(input: {
  src?: string | null;
  referrer?: string | null;
  siteHost?: string | null;
}): ClassifiedVisit {
  const tagged = input.src?.trim().toLowerCase() ?? "";
  if (tagged && (VIEW_SOURCES as readonly string[]).includes(tagged)) {
    const classified = classifyReferrerHost(input.referrer, input.siteHost);
    return { source: tagged as ViewSource, referrerHost: classified.referrerHost };
  }

  return classifyReferrerHost(input.referrer, input.siteHost);
}

/** Percentage of unique visitors who placed an order, rounded to one decimal. */
export function conversionRate(orders: number, uniqueVisitors: number): number {
  if (uniqueVisitors <= 0) return 0;
  return Math.round((orders / uniqueVisitors) * 1000) / 10;
}
