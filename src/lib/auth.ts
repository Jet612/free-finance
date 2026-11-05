import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { appOwner } from "@/db/schema";
import { databaseUrl } from "@/lib/app-config";
import { requiresMfaChallenge } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuthState = {
  user: {
    id: string;
    email: string | null;
  };
  currentLevel: string | null;
  needsMfa: boolean;
};

let claimedOwnerId: string | undefined;

/**
 * The owner is claimed once on the first-run screen. DASHBOARD_USER_ID still
 * works for deployments set up before that screen existed.
 */
async function ownerUserId(): Promise<string | null> {
  // PostgreSQL returns UUIDs in lowercase; normalize valid environment input.
  const configured = process.env.DASHBOARD_USER_ID?.trim().toLowerCase();
  if (configured) {
    if (!UUID_PATTERN.test(configured)) {
      throw new Error("DASHBOARD_USER_ID must be a Supabase user's UUID.");
    }
    return configured;
  }
  if (claimedOwnerId) return claimedOwnerId;
  if (!databaseUrl()) return null;

  const [owner] = await getDb()
    .select({ userId: appOwner.userId })
    .from(appOwner)
    .limit(1);
  claimedOwnerId = owner?.userId;
  return owner?.userId ?? null;
}

export async function hasOwner(): Promise<boolean> {
  return (await ownerUserId()) !== null;
}

export const getAuthState = cache(async (): Promise<AuthState | null> => {
  const supabase = await createClient();
  // getUser() asks Supabase Auth instead of trusting a client-controlled cookie.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || user.id !== (await ownerUserId())) return null;

  // getUser() has just verified this token with Supabase, so its `aal` claim is
  // safe to read. The factor list below comes from that same verified response.
  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) return null;

  const currentLevel = assurance.currentLevel;
  return {
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    currentLevel,
    // Once a user opts into TOTP, completing it is required for that session.
    needsMfa: requiresMfaChallenge(user.factors, currentLevel),
  };
});

export async function hasSession(): Promise<boolean> {
  const state = await getAuthState();
  return Boolean(state && !state.needsMfa);
}

export async function requireSession(): Promise<AuthState> {
  const state = await getAuthState();
  if (!state) redirect("/login");
  if (state.needsMfa) redirect("/mfa");
  return state;
}

export async function requirePrimarySession(): Promise<AuthState> {
  const state = await getAuthState();
  if (!state) redirect("/login");
  return state;
}
