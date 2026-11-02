/**
 * Sign-in brute-force protection: keys are hashed, limits are per device+account
 * and per IP, and a successful sign-in clears the device's history.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  clearLoginFailures,
  ipKey,
  isLoginBlocked,
  loginKey,
  pruneAuthAttempts,
  recordLoginFailure,
  LOGIN_MAX_FAILURES,
  LOGIN_MAX_FAILURES_PER_IP,
} = await import("../lib/repositories/auth-attempts.ts");
const { getDb } = await import("../lib/db/index.ts");

const EMAIL = "throttle@test.ng";
const IP = "198.51.100.10";

test("login keys hide the email and the IP address", () => {
  const key = loginKey(IP, EMAIL);
  const ip = ipKey(IP);

  assert.equal(key.length, 40);
  assert.equal(ip.length, 40);
  assert.equal(key.includes("throttle@test.ng"), false);
  assert.equal(key.includes("198.51.100.10"), false);

  // Case and whitespace do not create a second bucket.
  assert.equal(loginKey(IP, "  THROTTLE@test.ng "), key);

  // Keys are salted per day, so they rotate.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  assert.notEqual(loginKey(IP, EMAIL, tomorrow), key);
});

test("repeated failures lock the account for that device", () => {
  const key = loginKey(IP, EMAIL);
  const ip = ipKey(IP);
  clearLoginFailures(key);

  assert.equal(isLoginBlocked(key, ip), false);

  for (let index = 0; index < LOGIN_MAX_FAILURES; index += 1) {
    recordLoginFailure(key, ip, "failed");
  }

  assert.equal(isLoginBlocked(key, ip), true);

  // A different device is unaffected.
  const otherIp = ipKey("203.0.113.77");
  assert.equal(isLoginBlocked(loginKey("203.0.113.77", EMAIL), otherIp), false);

  // So is the same device with a different account.
  assert.equal(isLoginBlocked(loginKey(IP, "someone-else@test.ng"), ip), false);
});

test("a successful sign-in clears the device's failures", () => {
  const key = loginKey(IP, EMAIL);
  const ip = ipKey(IP);
  assert.equal(isLoginBlocked(key, ip), true);

  clearLoginFailures(key);
  assert.equal(isLoginBlocked(key, ip), false);
  assert.equal(
    Number(
      getDb().prepare("SELECT COUNT(*) AS c FROM auth_attempts WHERE key = ?").get(key).c,
    ),
    0,
  );
});

test("a single IP cannot spread failures across many accounts", () => {
  const sharedIp = "203.0.113.200";
  const ip = ipKey(sharedIp);

  // One failure per account, many accounts, one IP.
  for (let index = 0; index < LOGIN_MAX_FAILURES_PER_IP; index += 1) {
    recordLoginFailure(loginKey(sharedIp, `user${index}@test.ng`), ip, "failed");
  }

  // The IP itself is now blocked, even for a fresh account.
  assert.equal(isLoginBlocked(loginKey(sharedIp, "fresh@test.ng"), ip), true);
});

test("old attempt rows are pruned", () => {
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  getDb()
    .prepare(
      "INSERT INTO auth_attempts (id, key, ip_hash, outcome, created_at) VALUES (?, ?, ?, 'failed', ?)",
    )
    .run("00000000-0000-4000-8000-0000000000aa", "old-key", "old-ip", old);

  assert.ok(pruneAuthAttempts(30) >= 1);
  assert.equal(
    Number(getDb().prepare("SELECT COUNT(*) AS c FROM auth_attempts WHERE key = 'old-key'").get().c),
    0,
  );
});
