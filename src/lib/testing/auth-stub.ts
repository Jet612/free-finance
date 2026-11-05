/**
 * Stands in for @/lib/auth in `pnpm test:db` (see tsconfig.integration.json),
 * because real sessions need a Next.js request. Nothing in the app imports it.
 */
export async function requireSession() {
  return { user: { id: "test-owner", email: null } };
}
