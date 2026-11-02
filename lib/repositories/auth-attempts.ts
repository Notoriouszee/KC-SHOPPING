import { createHash } from "node:crypto";
import { getDb, nowIso } from "../db";
import { newId } from "../domain/ids";

/**
 * Brute-force protection for sign-in.
 *
 * Limits are per (IP + email) and per IP. Keys are daily-salted hashes, so the
 * table cannot be used to discover which emails have accounts.
 */

export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_IP_WINDOW_MINUTES = 60;
export const LOGIN_MAX_FAILURES_PER_IP = 30;

function dayStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function salt(): string {
  return process.env.ORDERPILOT_IP_SALT ?? "kandc";
}

export function loginKey(ip: string, email: string, date = new Date()): string {
  return createHash("sha256")
    .update(`${salt()}:login:${dayStamp(date)}:${ip}:${email.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 40);
}

export function ipKey(ip: string, date = new Date()): string {
  return createHash("sha256")
    .update(`${salt()}:ip:${dayStamp(date)}:${ip}`)
    .digest("hex")
    .slice(0, 40);
}

function sinceIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function countFor(column: "key" | "ip_hash", value: string, minutes: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total FROM auth_attempts WHERE ${column} = ? AND created_at > ?`,
    )
    .get(value, sinceIso(minutes)) as { total: number } | undefined;
  return Number(row?.total ?? 0);
}

/** True when this device/email pair, or this IP, has failed too often. */
export function isLoginBlocked(key: string, ip: string): boolean {
  return (
    countFor("key", key, LOGIN_WINDOW_MINUTES) >= LOGIN_MAX_FAILURES ||
    countFor("ip_hash", ip, LOGIN_IP_WINDOW_MINUTES) >= LOGIN_MAX_FAILURES_PER_IP
  );
}

export function recordLoginFailure(key: string, ipHash: string, outcome: "failed" | "blocked"): void {
  getDb()
    .prepare(
      "INSERT INTO auth_attempts (id, key, ip_hash, outcome, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(newId(), key, ipHash, outcome, nowIso());
}

/** Clears this device's history for the account after a successful sign-in. */
export function clearLoginFailures(key: string): void {
  getDb().prepare("DELETE FROM auth_attempts WHERE key = ?").run(key);
}

/** Housekeeping for the maintenance script. */
export function pruneAuthAttempts(olderThanDays = 30): number {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const result = getDb().prepare("DELETE FROM auth_attempts WHERE created_at < ?").run(cutoff);
  return Number(result.changes ?? 0);
}
