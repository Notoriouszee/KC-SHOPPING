import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase clients.
 *
 * Two flavours:
 *  - `supabaseServer()`  — bound to the signed-in user's session cookie, so every
 *    query runs as that user and Row Level Security applies.
 *  - `supabaseAdmin()`   — service role, **bypasses RLS**, for the few operations
 *    that must not run as a user (e.g. writing anonymous view counters). Never
 *    import this into a client component.
 *
 * Both throw a clear error if the project is not configured, rather than failing
 * later with a confusing network error.
 */

export function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "SUPABASE_URL is not set. Copy .env.example to .env.local and fill in your project URL.",
    );
  }
  return url.replace(/\/+$/, "");
}

export function supabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Copy .env.example to .env.local.",
    );
  }
  return key;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY),
  );
}

/** Cookie-bound client for server components, server actions and route handlers. */
export async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(entries) {
        try {
          for (const { name, value, options } of entries) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, where cookies are read-only. The
          // session refresh happens in middleware instead.
        }
      },
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Service role                                                               */
/* -------------------------------------------------------------------------- */

let adminClient: import("@supabase/supabase-js").SupabaseClient | null = null;

/**
 * Server-only client with the service role key. RLS does not apply, so every
 * call must do its own ownership checks.
 */
export async function supabaseAdmin() {
  if (adminClient) return adminClient;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. It is required for server-side writes that run outside a user session.",
    );
  }

  const { createClient } = await import("@supabase/supabase-js");
  adminClient = createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
