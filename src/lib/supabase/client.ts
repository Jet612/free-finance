"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, publishableKey } = getSupabasePublicEnv();

  return createBrowserClient(url, publishableKey, {
    auth: {
      // Supabase keeps passkeys opt-in while the API is experimental.
      experimental: { passkey: true },
    },
  });
}
