import { createHash, randomBytes } from "node:crypto";
import { getDb, nowIso } from "../db";
import { newId } from "../domain/ids";
import { findUserByEmail } from "./users";
import { hashPassword, passwordProblem } from "./password";

/**
 * Password resets.
 *
 * The token is random, single-use, expires in an hour, and only its SHA-256 hash
 * is stored — a leaked database cannot be used to reset anyone's password.
 *
 * No mail provider is configured in this project, so `deliveryHint()` tells the
 * caller whether it may show the link on screen (development/demo) or must claim
 * it was emailed (production with a transport).
 */

const RESET_TTL_MINUTES = 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function passwordResetLinksVisible(): boolean {
  // Set to "0" once email delivery exists; then the link is never shown on screen.
  return process.env.ORDERPILOT_SHOW_RESET_LINKS !== "0";
}

export type ResetRequest = { token: string; resetUrl: string } | null;

/**
 * Creates a reset token for an existing account. Returns null for unknown emails
 * so the caller can respond identically either way.
 */
export async function createResetToken(
  email: string,
  buildUrl: (token: string) => string,
): Promise<ResetRequest> {
  const user = await findUserByEmail(email);
  if (!user) return null;

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000).toISOString();

  // Invalidate earlier unused tokens so only the newest link works.
  await (await getDb())
    .prepare("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL")
    .run(nowIso(), user.id);

  await (await getDb())
    .prepare(
      "INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(newId(), user.id, hashToken(token), expires, nowIso());

  return { token, resetUrl: buildUrl(token) };
}

export type ResetResult = { ok: true } | { ok: false; error: string };

export async function resetPassword(token: string, newPassword: string): Promise<ResetResult> {
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, error: problem };

  const row = await (await getDb())
    .prepare(
      `SELECT r.id, r.user_id, r.expires_at, r.used_at
       FROM password_resets r
       WHERE r.token_hash = ?`,
    )
    .get<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
      hashToken(token),
    );

  if (!row) return { ok: false, error: "That reset link is not valid." };
  if (row.used_at) return { ok: false, error: "That reset link has already been used." };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "That reset link has expired. Request a new one." };
  }

  const passwordHash = await hashPassword(newPassword);
  const db = await getDb();

  await db.transaction(async (tx) => {
    await tx.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
      passwordHash,
      nowIso(),
      row.user_id,
    );
    await tx.prepare("UPDATE password_resets SET used_at = ? WHERE id = ?").run(nowIso(), row.id);
    // Any session opened with the old password is no longer trusted.
    await tx.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id);
  });

  return { ok: true };
}

export async function prunePasswordResets(olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const result = await (await getDb()).prepare("DELETE FROM password_resets WHERE created_at < ?").run(cutoff);
  return Number(result.changes ?? 0);
}
