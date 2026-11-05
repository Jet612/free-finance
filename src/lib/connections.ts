import "server-only";

import { eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { accounts, plaidItems, type PlaidItem } from "@/db/schema";
import { appSecret, plaidConfig, type PlaidConfig } from "@/lib/app-config";
import {
  exchangePublicToken,
  fetchCachedAccounts,
  fetchItemDetails,
  fetchLinkPublicTokens,
  PlaidApiError,
  removeItem,
} from "@/lib/plaid/client";
import {
  decryptToken,
  encryptToken,
  TokenUnreadableError,
} from "@/lib/token-crypto";

export const LINK_COOKIE = "free_finance_plaid_link";

/** Remembers which Plaid session the browser is returning from. */
export type PendingLink = {
  linkToken: string;
  /** Set when repairing an existing connection rather than adding one. */
  itemRowId?: number;
};

export function parsePendingLink(value: string | undefined): PendingLink | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingLink>;
    if (typeof parsed.linkToken !== "string") return null;
    return {
      linkToken: parsed.linkToken,
      itemRowId:
        typeof parsed.itemRowId === "number" ? parsed.itemRowId : undefined,
    };
  } catch {
    return null;
  }
}

export function requireConnectionConfig(): {
  config: PlaidConfig;
  secret: string;
} {
  const config = plaidConfig();
  const secret = appSecret();
  if (!config || !secret) {
    throw new Error("Plaid is not configured.");
  }
  return { config, secret };
}

export function accessTokenFor(item: PlaidItem, secret: string): string {
  return decryptToken(item.accessTokenEncrypted, secret, item.itemId);
}

async function isAlreadyConnected(
  config: PlaidConfig,
  accessToken: string,
  institutionId: string | null,
): Promise<boolean> {
  if (!institutionId) return false;
  const [incoming, existing] = await Promise.all([
    fetchCachedAccounts(config, accessToken),
    getDb()
      .select({ name: accounts.name, mask: accounts.mask })
      .from(accounts)
      .where(
        sql`${accounts.connected} and ${accounts.metadata}->>'institution_id' = ${institutionId}`,
      ),
  ]);
  const known = new Set(existing.map((row) => `${row.name}|${row.mask}`));
  return (
    incoming.length > 0 &&
    incoming.every((account) =>
      known.has(`${account.name}|${account.mask ?? null}`),
    )
  );
}

export type NewConnections = {
  itemRowIds: number[];
  duplicates: number;
};

/**
 * Turns a finished Plaid session into saved connections. Linking the same bank
 * twice would double-count every balance in net worth, so a repeat is removed
 * from Plaid straight away and never saved.
 */
export async function saveNewConnections(
  linkToken: string,
): Promise<NewConnections> {
  const { config, secret } = requireConnectionConfig();
  const publicTokens = await fetchLinkPublicTokens(config, linkToken);
  const itemRowIds: number[] = [];
  let duplicates = 0;

  for (const publicToken of publicTokens) {
    const accessToken = await exchangePublicToken(config, publicToken);
    const details = await fetchItemDetails(config, accessToken);

    if (await isAlreadyConnected(config, accessToken, details.institutionId)) {
      await removeItem(config, accessToken);
      duplicates += 1;
      continue;
    }

    const [row] = await getDb()
      .insert(plaidItems)
      .values({
        itemId: details.itemId,
        institutionId: details.institutionId,
        institutionName: details.institutionName,
        accessTokenEncrypted: encryptToken(
          accessToken,
          secret,
          details.itemId,
        ),
      })
      .onConflictDoUpdate({
        target: plaidItems.itemId,
        set: {
          accessTokenEncrypted: sql`excluded.access_token_encrypted`,
          status: "active",
          updatedAt: new Date(),
        },
      })
      .returning({ id: plaidItems.id });
    itemRowIds.push(row.id);
  }
  return { itemRowIds, duplicates };
}

export async function clearItemError(itemRowId: number): Promise<void> {
  await getDb()
    .update(plaidItems)
    .set({
      status: "active",
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(plaidItems.id, itemRowId));
}

/** Plaid has already forgotten these, so there's nothing left to revoke. */
const ALREADY_GONE_CODES = new Set(["ITEM_NOT_FOUND", "INVALID_ACCESS_TOKEN"]);

/**
 * Revokes Plaid's access first. If that fails the token is kept, because losing
 * it would leave a connection that nobody can stop or stop paying for. History
 * stays in the database, but the accounts stop counting toward totals.
 *
 * Returns false when Plaid couldn't be told. That happens with a token that can't
 * be decrypted, so the owner has to revoke the connection in Plaid's dashboard.
 */
export async function disconnectItem(item: PlaidItem): Promise<boolean> {
  const { config, secret } = requireConnectionConfig();
  let revoked = true;
  try {
    await removeItem(config, accessTokenFor(item, secret));
  } catch (error) {
    if (error instanceof TokenUnreadableError) {
      revoked = false;
    } else if (
      !(error instanceof PlaidApiError && ALREADY_GONE_CODES.has(error.code))
    ) {
      throw error;
    }
  }

  await getDb().transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ connected: false, updatedAt: new Date() })
      .where(sql`${accounts.metadata}->>'item_id' = ${item.itemId}`);
    await tx.delete(plaidItems).where(eq(plaidItems.id, item.id));
  });
  return revoked;
}
