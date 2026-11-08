/**
 * Transactional email.
 *
 * Uses Resend (a single HTTPS call, no SDK and no native dependency, which keeps
 * the Vercel bundle small). If no provider is configured the message is logged and
 * reported as "skipped" rather than throwing: an email problem must never break an
 * order.
 *
 * Environment:
 *   RESEND_API_KEY   secret, server-side only
 *   EMAIL_FROM       e.g. "K&C Shopping <orders@yourdomain.com>"
 *   EMAIL_REPLY_TO   optional
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailResult = {
  ok: boolean;
  /** True when no provider is configured; the message was only logged. */
  skipped?: boolean;
  providerId?: string;
  error?: string;
};

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || "K&C Shopping <onboarding@resend.dev>";
}

export function emailReplyTo(): string | null {
  return process.env.EMAIL_REPLY_TO?.trim() || null;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!isEmail(message.to)) {
    return { ok: false, error: `Invalid recipient address: ${message.to || "(empty)"}` };
  }

  if (!emailConfigured()) {
    console.info(
      `[email] not configured; would send "${message.subject}" to ${message.to}`,
    );
    return { ok: true, skipped: true };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(emailReplyTo() ? { reply_to: emailReplyTo() } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);

    const body = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string }
      | null;

    if (!response.ok) {
      return {
        ok: false,
        error: body?.message || body?.name || `Email provider responded ${response.status}`,
      };
    }

    return { ok: true, providerId: body?.id };
  } catch (error) {
    const messageText =
      error instanceof Error
        ? error.name === "AbortError"
          ? "Email provider timed out"
          : error.message
        : "Unknown email error";
    return { ok: false, error: messageText };
  }
}