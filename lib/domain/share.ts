/**
 * Text formats used when sharing a product.
 *
 * These live outside the React component so the exact strings a seller pastes
 * into WhatsApp, a Status or a Story can be unit-tested. Get them wrong and the
 * customer receives a message with no usable link.
 */

export type ShareContent = {
  name: string;
  priceLabel: string;
  shopName: string;
  url: string;
  description?: string | null;
  available?: boolean;
};

/** Short caption: product, price and shop. */
export function shareMessage(content: ShareContent): string {
  const lines = [content.name, content.priceLabel];
  if (content.available === false) lines[1] = `${content.priceLabel} (out of stock)`;
  lines.push(content.shopName);
  return lines.join("\n");
}

/** The caption plus the link — what actually gets pasted into a chat or Status. */
export function shareTextWithLink(content: ShareContent): string {
  return `${shareMessage(content)}\n${content.url}`;
}

/**
 * WhatsApp's share endpoint. `wa.me/?text=` opens WhatsApp's own picker, where
 * the seller can choose a chat or "My status" — no phone number required.
 */
export function whatsappShareUrl(content: ShareContent): string {
  return `https://wa.me/?text=${encodeURIComponent(shareTextWithLink(content))}`;
}

/** Fuller copy: status, description and link, for pasting into posts. */
export function productDetailsText(content: ShareContent): string {
  const blocks = [
    content.name,
    content.priceLabel + (content.available === false ? " · Out of stock" : ""),
    content.shopName,
  ];

  const description = content.description?.trim();
  if (description) blocks.push(description.length > 300 ? `${description.slice(0, 297)}…` : description);

  blocks.push(content.url);
  return blocks.join("\n\n");
}

/**
 * A safe download name for a product photo. Used for `download` attributes and
 * the File passed to the Web Share API.
 *
 * Only known image extensions are kept; anything else falls back to `.png`
 * rather than inventing an extension from an unexpected MIME type.
 */
export function fileNameForProduct(name: string, mimeType: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "product";

  const candidate = (mimeType.split("/")[1] ?? "").split("+")[0].toLowerCase();
  const extension = /^(png|jpe?g|webp|gif|avif)$/.test(candidate) ? candidate : "png";

  return `${base}.${extension}`;
}

/**
 * Native-share payload. The Web Share API rejects `files` on browsers that only
 * implement the older spec, so the caller checks `canShare` first.
 */
export function nativeSharePayload(content: ShareContent): { title: string; text: string; url: string } {
  return {
    title: `${content.name} — ${content.shopName}`,
    text: shareMessage(content),
    url: content.url,
  };
}
