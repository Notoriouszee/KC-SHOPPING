import type { User } from "../domain/types";
import { getDb, nowIso, plainRow } from "../db";
import { newId } from "../domain/ids";
import { assignInitialSlug } from "../repositories/shop";
import { hashPassword, verifyPassword } from "./password";

export type SafeUser = Omit<User, "password_hash">;

const SESSION_DAYS = 30;

function toSafeUser(row: User): SafeUser {
  const { password_hash: _ignored, ...safe } = row;
  return safe;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const row = await (await getDb())
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.trim().toLowerCase());
  return plainRow<User>(row);
}

export async function findUserById(id: string): Promise<User | null> {
  const row = await (await getDb()).prepare("SELECT * FROM users WHERE id = ?").get(id);
  return plainRow<User>(row);
}

export type SignUpInput = {
  email: string;
  password: string;
  ownerName: string;
  /** Required for sellers; ignored for customers. */
  businessName?: string;
  phone?: string | null;
  accountType?: "seller" | "customer";
};

/**
 * Creates a seller or customer account. Returns the safe user plus the raw
 * session token. Only sellers get a shop slug.
 */
export async function signUp(
  input: SignUpInput,
): Promise<{ user: SafeUser; token: string } | { error: string }> {
  const email = input.email.trim().toLowerCase();
  if (await findUserByEmail(email)) {
    return { error: "An account with that email already exists. Try signing in." };
  }

  const accountType = input.accountType === "customer" ? "customer" : "seller";
  const ownerName = input.ownerName.trim();
  // Customers have no business; keep the column meaningful without inventing a shop.
  const businessName =
    accountType === "seller" ? (input.businessName ?? "").trim() : ownerName;

  if (accountType === "seller" && businessName.length < 2) {
    return { error: "Enter your business or shop name." };
  }

  const id = newId();
  const passwordHash = await hashPassword(input.password);
  const createdAt = nowIso();

  await (await getDb())
    .prepare(
      `INSERT INTO users (id, email, password_hash, owner_name, business_name, phone, role, account_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'seller', ?, ?, ?)`,
    )
    .run(
      id,
      email,
      passwordHash,
      ownerName,
      businessName,
      input.phone?.trim() || null,
      accountType,
      createdAt,
      createdAt,
    );

  const user = await findUserById(id);
  if (!user) return { error: "Could not create your account. Please try again." };

  // Every seller gets a working public shop link immediately; customers do not.
  if (accountType === "seller") {
    await assignInitialSlug(user.id, businessName);
  }

  const token = await createSession(user.id);
  return { user: toSafeUser(user), token };
}

export async function authenticate(
  email: string,
  password: string,
): Promise<{ user: SafeUser; token: string } | null> {
  const user = await findUserByEmail(email);
  if (!user) {
    // Constant-ish work so a missing account is not obviously faster.
    await verifyPassword(password, `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`);
    return null;
  }
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;
  return { user: toSafeUser(user), token: await createSession(user.id) };
}

export async function createSession(userId: string): Promise<string> {
  const token = `${newId()}${newId()}`.replace(/-/g, "");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await (await getDb())
    .prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, nowIso(), expires.toISOString());
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await (await getDb()).prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export async function userForSessionToken(token: string): Promise<SafeUser | null> {
  const row = await (await getDb())
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get<User>(token, nowIso());
  if (!row) return null;
  return toSafeUser(plainRow<User>(row)!);
}

export async function updateProfile(
  userId: string,
  input: { ownerName: string; businessName: string; phone?: string | null },
): Promise<void> {
  await (await getDb())
    .prepare(
      `UPDATE users SET owner_name = ?, business_name = ?, phone = ?, updated_at = ? WHERE id = ?`,
    )
    .run(input.ownerName.trim(), input.businessName.trim(), input.phone?.trim() || null, nowIso(), userId);
}
