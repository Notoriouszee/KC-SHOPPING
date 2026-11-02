/**
 * Housekeeping for the tracking and abuse-prevention tables.
 *
 * Run on a schedule (cron, Task Scheduler) — e.g. nightly:
 *   node --import ./scripts/register.mjs scripts/prune.mjs
 */
import { pruneAttempts } from "../lib/repositories/public-orders.ts";
import { pruneViews } from "../lib/repositories/analytics.ts";
import { pruneAuthAttempts } from "../lib/repositories/auth-attempts.ts";

pruneAttempts();
pruneViews();
pruneAuthAttempts();

console.log("Pruned expired analytics and abuse-prevention rows.");
