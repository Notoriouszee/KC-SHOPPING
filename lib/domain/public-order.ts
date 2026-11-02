/**
 * Limits for anonymous ordering.
 *
 * Kept in the domain layer (no database or crypto imports) because both the
 * server-side repository and the customer's form need the same quantity cap.
 */

export const MAX_PUBLIC_QUANTITY = 20;

/** Rate limiting windows for a single client. */
export const PUBLIC_ORDER_RATE_WINDOW_MINUTES = 15;
export const PUBLIC_ORDER_MAX_PER_WINDOW = 5;
export const PUBLIC_ORDER_MAX_PER_HOUR = 20;

/** How long an order-attempt row is kept before housekeeping removes it. */
export const PUBLIC_ORDER_ATTEMPT_RETENTION_DAYS = 7;
