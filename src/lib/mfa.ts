type Factor = { status: string };

/**
 * Whether this session still owes an authenticator code. `factors` must come
 * from Supabase's getUser() response, never from the session cookie: the cookie
 * can be edited by the client, and removing its factor list would skip MFA.
 */
export function requiresMfaChallenge(
  factors: readonly Factor[] | undefined,
  currentLevel: string | null,
): boolean {
  const enrolled = factors?.some((factor) => factor.status === "verified");
  return Boolean(enrolled) && currentLevel !== "aal2";
}
