import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack — hosted checkout.
 *
 * The secret key never leaves the server. We initialise a transaction, redirect
 * the seller to Paystack, and then confirm the outcome by *verifying* the
 * reference with Paystack rather than trusting the redirect.
 */

const BASE = "https://api.paystack.co";

export function paystackSecret(): string | null {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  return key ? key : null;
}

export function paystackConfigured(): boolean {
  return paystackSecret() !== null;
}

export function paystackMode(): "test" | "live" | "unconfigured" {
  const key = paystackSecret();
  if (!key) return "unconfigured";
  return key.startsWith("sk_live") ? "live" : "test";
}

type PaystackResponse<T> = { status: boolean; message: string; data: T };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const secret = paystackSecret();
  if (!secret) throw new Error("Paystack is not configured (PAYSTACK_SECRET_KEY).");

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as PaystackResponse<T> | null;

  if (!response.ok || !body?.status) {
    throw new Error(body?.message || `Paystack request failed (${response.status}).`);
  }

  return body.data;
}

export type InitializeResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<InitializeResult> {
  const data = await call<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      callback_url: input.callbackUrl,
      currency: "NGN",
      metadata: input.metadata ?? {},
    }),
  });

  return {
    authorizationUrl: data.authorization_url,
    accessCode: data.access_code,
    reference: data.reference,
  };
}

export type VerifyResult = {
  status: string;
  reference: string;
  amountKobo: number;
  currency: string;
  paidAt: string | null;
  metadata: Record<string, unknown>;
};

export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const data = await call<{
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    metadata: Record<string, unknown> | null;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);

  return {
    status: data.status,
    reference: data.reference,
    amountKobo: Number(data.amount ?? 0),
    currency: data.currency,
    paidAt: data.paid_at,
    metadata: data.metadata ?? {},
  };
}

/**
 * Webhook authenticity: Paystack signs the raw body with your secret key using
 * HMAC-SHA512. Compare in constant time.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = paystackSecret();
  if (!secret || !signature) return false;

  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");

  return a.length === b.length && timingSafeEqual(a, b);
}

/** Reference we generate; also carries the seller id for the callback. */
export function subscriptionReference(sellerId: string): string {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `kc_sub_${sellerId.slice(0, 8)}_${stamp}_${random}`;
}
