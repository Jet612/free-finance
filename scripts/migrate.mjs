#!/usr/bin/env node
// Applies pending database migrations as part of a production deploy, so nobody
// has to run them by hand. A failure here fails the build, which leaves the
// previous working deployment live.
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

function loadLocalEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Vercel builds have no .env.local; their settings are already in the env.
  }
}

function migrationUrl() {
  const value =
    process.env.DATABASE_MIGRATION_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;
  if (!value) return null;
  try {
    // postgres.js forwards unknown parameters, and Supabase's pooler rejects this.
    const url = new URL(value.trim());
    url.searchParams.delete("supa");
    return url;
  } catch {
    // Node's own error would print the URL, password included, to the build log.
    console.error("The database URL isn't valid. Check it for special characters.");
    process.exit(1);
  }
}

if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
  console.log("Skipping migrations: this is not a production deployment.");
  process.exit(0);
}

if (!process.env.VERCEL) loadLocalEnv();

const url = migrationUrl();
if (!url) {
  console.log("Skipping migrations: no database is configured.");
  process.exit(0);
}

const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
const client = postgres(url.toString(), {
  max: 1,
  prepare: false,
  // postgres.js connects unencrypted unless told otherwise.
  ssl: local ? false : "require",
  onnotice: () => {},
});
try {
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("Database migrations are up to date.");
} finally {
  await client.end();
}
