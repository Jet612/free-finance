import assert from "node:assert/strict";
import test from "node:test";

import {
  appSecret,
  cleanPostgresUrl,
  databaseSsl,
  databaseUrl,
  parseCountryCodes,
  plaidConfig,
  setupIssues,
  supabaseAdminKey,
} from "./app-config";

const longSecret = "correct-horse-battery-staple-1234";

const complete = {
  DATABASE_URL: "postgres://user:pass@host:6543/postgres",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  PLAID_CLIENT_ID: "client",
  PLAID_SECRET: "secret",
  CRON_SECRET: longSecret,
};

test("accepts the variable names Vercel's Supabase integration provides", () => {
  assert.equal(
    databaseUrl({ POSTGRES_URL: "postgres://user:pass@host:6543/postgres" }),
    "postgres://user:pass@host:6543/postgres",
  );
  assert.equal(
    supabaseAdminKey({ SUPABASE_SERVICE_ROLE_KEY: "legacy" }),
    "legacy",
  );
});

test("DATABASE_URL wins over the integration's URL", () => {
  assert.equal(
    databaseUrl({ DATABASE_URL: "postgres://a/b", POSTGRES_URL: "postgres://c/d" }),
    "postgres://a/b",
  );
});

test("strips Supabase's routing parameter but keeps sslmode", () => {
  const cleaned = cleanPostgresUrl(
    "postgres://u:p@host:6543/postgres?sslmode=require&supa=base-pooler.x",
  );
  assert.match(cleaned, /sslmode=require/);
  assert.doesNotMatch(cleaned, /supa=/);
});

test("rejects a setup password that is too short or too simple", () => {
  assert.equal(appSecret({ CRON_SECRET: "short" }), null);
  assert.equal(appSecret({ CRON_SECRET: "a".repeat(40) }), null);
  assert.equal(appSecret({ CRON_SECRET: "abcabcabc".repeat(5) }), null);
  assert.equal(appSecret({ CRON_SECRET: longSecret }), longSecret);
});

test("requires encryption for every database that isn't this machine", () => {
  assert.equal(databaseSsl("postgres://u:p@db.example.com:5432/x"), "require");
  assert.equal(databaseSsl("postgres://u:p@localhost:5432/x"), false);
  assert.equal(databaseSsl("postgres://u:p@127.0.0.1:5432/x"), false);
  assert.equal(databaseSsl("not a url"), "require");
});

test("Plaid defaults to production and only accepts sandbox explicitly", () => {
  const base = { PLAID_CLIENT_ID: "c", PLAID_SECRET: "s" };
  assert.equal(plaidConfig(base)?.baseUrl, "https://production.plaid.com");
  assert.equal(
    plaidConfig({ ...base, PLAID_ENV: "Sandbox" })?.baseUrl,
    "https://sandbox.plaid.com",
  );
  // A typo can't redirect credentials to a host built from the raw value.
  assert.equal(
    plaidConfig({ ...base, PLAID_ENV: "evil.example.com#" })?.baseUrl,
    "https://production.plaid.com",
  );
  assert.equal(plaidConfig({ PLAID_CLIENT_ID: "c" }), null);
});

test("cleans up country codes", () => {
  assert.deepEqual(parseCountryCodes(" us, ca ,US,xyz"), ["US", "CA"]);
  assert.deepEqual(parseCountryCodes(""), ["US"]);
  assert.deepEqual(parseCountryCodes(undefined), ["US"]);
});

test("reports nothing once everything is filled in", () => {
  assert.deepEqual(setupIssues(complete), []);
});

test("explains each missing piece", () => {
  assert.deepEqual(
    setupIssues({}).map((issue) => issue.key),
    ["database", "supabase", "plaid", "secret"],
  );
  assert.deepEqual(
    setupIssues({ ...complete, CRON_SECRET: "short" }).map((issue) => issue.key),
    ["secret"],
  );
});
