import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client.
 *
 * Every write in the app goes through this client (see `lib/events.ts`), which
 * keeps the changelog diffing in one place — a mutation that bypassed the
 * server would silently skip its changelog entry.
 */
export function createServerClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and either " +
        "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY. See .env.example.",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next wraps fetch with its own cache. Without this, a server-rendered
      // view keeps serving the first response it ever saw, so a date change
      // made by one person stays invisible to everyone else — the exact
      // failure the realtime requirement exists to prevent.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
