"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client, used for realtime subscriptions only.
 *
 * Reads are server-rendered and writes go through server route handlers; this
 * client exists so that an edit made on one screen appears on everyone else's
 * without a reload (PRD §2).
 */
export function getBrowserClient(): SupabaseClient {
  if (client) return client;

  // NEXT_PUBLIC_ vars are inlined into the client bundle at build time. Both
  // the classic anon-key name and the publishable-key name Vercel's
  // marketplace integration injects are accepted.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and either " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "See .env.example.",
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}
