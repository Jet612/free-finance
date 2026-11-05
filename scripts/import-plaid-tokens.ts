#!/usr/bin/env tsx
/**
 * One-time upgrade step for installs from before bank connections moved into
 * the app. Reads the Plaid tokens in .env.local, encrypts them, and saves them
 * with their sync position so nothing is imported twice.
 *
 *   pnpm plaid:import --dry-run    Show what would happen.
 *   pnpm plaid:import              Do it.
 *
 * CRON_SECRET in .env.local must match the value on Vercel, or the deployed app
 * won't be able to decrypt what this saves.
 */
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";

import { plaidItems, syncStates } from "../src/db/schema";
import {
  appSecret,
  databaseSsl,
  databaseUrl,
  plaidConfig,
} from "../src/lib/app-config";
import { fetchItemDetails } from "../src/lib/plaid/client";
import { encryptToken } from "../src/lib/token-crypto";

loadEnv({ path: ".env.local", quiet: true });

function readTokens(): string[] {
  const tokens = process.env.PLAID_ACCESS_TOKENS?.trim();
  if (tokens) {
    const parsed: unknown = JSON.parse(tokens);
    if (Array.isArray(parsed)) {
      return parsed.filter((token) => typeof token === "string" && token);
    }
  }
  const legacy = process.env.PLAID_ACCESS_TOKEN?.trim();
  return legacy ? [legacy] : [];
}

/** Older versions kept every bank's position in one JSON value. */
function readCursors(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as { items?: Record<string, string> };
    return parsed.items ?? {};
  } catch {
    return {};
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = plaidConfig();
  const secret = appSecret();
  const url = databaseUrl();
  if (!config || !url) {
    throw new Error("Set the Plaid keys and database URL in .env.local.");
  }
  if (!secret) {
    throw new Error("Set CRON_SECRET in .env.local to match Vercel.");
  }

  const tokens = readTokens();
  if (!tokens.length) throw new Error("No Plaid tokens found in .env.local.");

  const client = postgres(url, {
    max: 1,
    prepare: false,
    ssl: databaseSsl(url),
    onnotice: () => {},
  });
  const db = drizzle(client);
  try {
    const [state] = await db
      .select({ cursor: syncStates.cursor })
      .from(syncStates)
      .where(eq(syncStates.source, "plaid"));
    const cursors = readCursors(state?.cursor);

    for (const token of tokens) {
      const details = await fetchItemDetails(config, token);
      const cursor = cursors[details.itemId] ?? null;
      console.log(
        `${dryRun ? "Would import" : "Importing"} ${details.institutionName} ` +
          `(${cursor ? "keeping its sync position" : "from the beginning"})`,
      );
      if (dryRun) continue;

      await db
        .insert(plaidItems)
        .values({
          itemId: details.itemId,
          institutionId: details.institutionId,
          institutionName: details.institutionName,
          accessTokenEncrypted: encryptToken(token, secret, details.itemId),
          cursor,
          lastSuccessAt: new Date(),
        })
        .onConflictDoUpdate({
          target: plaidItems.itemId,
          set: {
            accessTokenEncrypted: sql`excluded.access_token_encrypted`,
            updatedAt: new Date(),
          },
        });
    }
    console.log(dryRun ? "Dry run finished. Nothing changed." : "Done.");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Import failed.");
  process.exit(1);
});
