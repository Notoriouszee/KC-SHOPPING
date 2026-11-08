/**
 * Re-sends order notifications that previously failed (for example while the
 * email provider was unreachable). Run it from a cron job or by hand:
 *
 *   node --import ./scripts/register.mjs scripts/email-retry.mjs [limit]
 */
import { loadEnv } from "./load-env.mjs";

loadEnv();

const limit = Number(process.argv[2] ?? 20);
const { retryFailedEmails } = await import("../lib/email/notify.ts");

const result = await retryFailedEmails(Number.isFinite(limit) ? limit : 20);
console.log(`retried: sent=${result.sent} failed=${result.failed} skipped=${result.skipped}`);
process.exit(result.failed > 0 ? 1 : 0);
