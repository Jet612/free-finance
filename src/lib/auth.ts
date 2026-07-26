import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuthState = {
  user: {
    id: string;
    email: string | null;
  };
  currentLevel: string | null;
  nextLevel: string | null;
  needsMfa: boolean;
};

function ownerUserId(): string {
  // PostgreSQL returns UUIDs in lowercase; normalize valid environment input.
  const userId = process.env.DASHBOARD_USER_ID?.trim().toLowerCase();
  if (!userId || !UUID_PATTERN.test(userId)) {
    throw new Error(
      "DASHBOARD_USER_ID must be the UUID of the manually provisioned Supabase user.",
    );
  }
  return userId;
}

export const getAuthState = cache(async (): Promise<AuthState | null> => {
  const supabase = await createClient();
  // getUser() asks Supabase Auth instead of trusting a client-controlled cookie.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || user.id !== ownerUserId()) return null;

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) return null;

  const currentLevel = assurance.currentLevel;
  const nextLevel = assurance.nextLevel;
  return {
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    currentLevel,
    nextLevel,
    // Once a user opts into TOTP, completing it is required for that session.
    needsMfa: nextLevel === "aal2" && currentLevel !== "aal2",
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
