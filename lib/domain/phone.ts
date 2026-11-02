/** Phone-number helpers for customer-facing links (tel:, wa.me). */

/**
 * Converts a Nigerian local number (0803...) to the international form
 * WhatsApp expects (234803...). Already-international numbers pass through.
 */
export function toInternationalPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0") && digits.length === 11) return `234${digits.slice(1)}`;
  if (digits.startsWith("234")) return digits;
  return digits;
}

export function whatsappUrl(phone: string, message?: string): string {
  const number = toInternationalPhone(phone);
  const suffix = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${number}${suffix}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
