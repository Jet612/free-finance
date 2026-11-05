/**
 * Reads deployment settings. Vercel's Supabase integration provisions
 * POSTGRES_URL and friends, while hand-configured installs use DATABASE_URL, so
 * both spellings are accepted here and nowhere else.
 */

type Env = Record<string, string | undefined>;

export const MIN_APP_SECRET_LENGTH = 32;
const MIN_APP_SECRET_VARIETY = 10;

export type PlaidEnvironment = "sandbox" | "production";

export type PlaidConfig = {
  clientId: string;
  secret: string;
  environment: PlaidEnvironment;
  baseUrl: string;
  countryCodes: string[];
};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Supabase appends `supa=...` for its own routing. postgres.js forwards unknown
 * query parameters to the server as startup options, which the pooler rejects.
 */
export function cleanPostgresUrl(value: string): string {
  try {
    const url = new URL(value);
    url.searchParams.delete("supa");
    return url.toString();
  } catch {
    return value;
  }
}

/**
 * postgres.js connects unencrypted unless told otherwise, and connection strings
 * copied from a dashboard don't always say. Only this machine may skip TLS.
 */
export function databaseSsl(url: string): "require" | false {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1"
      ? false
      : "require";
  } catch {
    return "require";
  }
}

export function databaseUrl(env: Env = process.env): string | null {
  const url = clean(env.DATABASE_URL) ?? clean(env.POSTGRES_URL);
  return url ? cleanPostgresUrl(url) : null;
}

/**
 * One secret the owner creates while deploying. Vercel sends it to the daily
 * cron route, the first-run screen uses it to prove who is claiming this
 * deployment, and the bank-token encryption key is derived from it.
 */
export function appSecret(env: Env = process.env): string | null {
  const secret = clean(env.CRON_SECRET);
  const strong =
    secret &&
    secret.length >= MIN_APP_SECRET_LENGTH &&
    new Set(secret).size >= MIN_APP_SECRET_VARIETY;
  return strong ? secret : null;
}

export function supabaseAdminKey(env: Env = process.env): string | null {
  return clean(env.SUPABASE_SECRET_KEY) ?? clean(env.SUPABASE_SERVICE_ROLE_KEY);
}

export function parseCountryCodes(value: string | undefined): string[] {
  const codes = (value ?? "US")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code));
  return codes.length ? Array.from(new Set(codes)) : ["US"];
}

export function plaidConfig(env: Env = process.env): PlaidConfig | null {
  const clientId = clean(env.PLAID_CLIENT_ID);
  const secret = clean(env.PLAID_SECRET);
  if (!clientId || !secret) return null;

  const environment: PlaidEnvironment =
    clean(env.PLAID_ENV)?.toLowerCase() === "sandbox"
      ? "sandbox"
      : "production";
  return {
    clientId,
    secret,
    environment,
    baseUrl: `https://${environment}.plaid.com`,
    countryCodes: parseCountryCodes(env.PLAID_COUNTRY_CODES),
  };
}

export type SetupIssue = {
  key: "database" | "supabase" | "plaid" | "secret";
  title: string;
  detail: string;
};

/** Plain-English list of what still has to be filled in on Vercel. */
export function setupIssues(env: Env = process.env): SetupIssue[] {
  const issues: SetupIssue[] = [];
  if (!databaseUrl(env)) {
    issues.push({
      key: "database",
      title: "The database isn't connected",
      detail:
        "In your Vercel project, open Storage and connect Supabase, then redeploy.",
    });
  }
  if (
    !clean(env.NEXT_PUBLIC_SUPABASE_URL) ||
    !clean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
    !supabaseAdminKey(env)
  ) {
    issues.push({
      key: "supabase",
      title: "Sign-in isn't connected",
      detail:
        "Connecting Supabase in your Vercel project's Storage tab adds these settings automatically. Redeploy afterward.",
    });
  }
  if (!plaidConfig(env)) {
    issues.push({
      key: "plaid",
      title: "Your Plaid keys are missing",
      detail:
        "Add PLAID_CLIENT_ID and PLAID_SECRET in your Vercel project's Environment Variables, then redeploy.",
    });
  }
  if (!appSecret(env)) {
    issues.push({
      key: "secret",
      title: "Your setup password is missing or too simple",
      detail: `Set CRON_SECRET in your Vercel project's Environment Variables to a random password of at least ${MIN_APP_SECRET_LENGTH} characters, then redeploy. A password manager can generate one.`,
    });
  }
  return issues;
}
