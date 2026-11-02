import { randomBytes, randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

// Crockford-ish alphabet: no I, L, O, U so references stay unambiguous when read
// aloud over the phone.
const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function orderReference(): string {
  let suffix = "";
  for (let index = 0; index < 6; index += 1) {
    suffix += REFERENCE_ALPHABET[Math.floor(Math.random() * REFERENCE_ALPHABET.length)];
  }
  return `OP-${suffix}`;
}

/** URL-safe random token, used for public access links. */
export function randomToken(bytes = 20): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, bytes);
}

/**
 * Token for a customer's order confirmation page: 24 random bytes, hex encoded.
 * Far beyond guessable, URL-safe, and cheap to validate by shape before a query.
 */
export function publicOrderToken(): string {
  return randomBytes(24).toString("hex");
}

export const PUBLIC_ORDER_TOKEN_PATTERN = /^[0-9a-f]{48}$/;
