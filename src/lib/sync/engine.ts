import "server-only";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  accounts,
  balanceSnapshots,
  holdings,
  investmentSnapshots,
  plaidItems,
  syncRuns,
  transactions,
  type PlaidItem,
} from "@/db/schema";
import { appSecret, plaidConfig, type PlaidConfig } from "@/lib/app-config";
import {
  fetchAccounts,
  fetchHoldings,
  fetchTransactionChanges,
} from "@/lib/plaid/client";
import { describePlaidError } from "@/lib/plaid/errors";
import {
  accountRow,
  holdingRows,
  investmentSnapshotRows,
  transactionRow,
} from "@/lib/plaid/mappers";
import { appTimeZone, todayInAppTimezone } from "@/lib/timezone";
import { decryptToken } from "@/lib/token-crypto";

const WRITE_BATCH_SIZE = 400;
const SOURCE = "plaid";

/** A run can't outlive its function, so anything older than this crashed. */
const STALE_LOCK_MINUTES = 10;

/** Long enough for a payment to clear across a weekend or a bank holiday. */
const CARD_PAYMENT_MATCH_DAYS = 5;

export type SyncTrigger = "scheduled" | "manual";

export type SyncOutcome =
  | { status: "success"; connections: number }
  | { status: "partial"; connections: number; failed: number }
  | { status: "failed"; connections: number; failed: number }
  | {
      status: "skipped";
      reason:
        | "not-configured"
        | "no-connections"
        | "already-synced-today"
        | "already-running";
    };

type ItemCounts = {
  accounts: number;
  transactionsAdded: number;
  transactionsModified: number;
  transactionsRemoved: number;
  holdings: number;
};

function batches<T>(rows: T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < rows.length; start += WRITE_BATCH_SIZE) {
    result.push(rows.slice(start, start + WRITE_BATCH_SIZE));
  }
  return result;
}

/**
 * Everything is fetched first, then written in one transaction together with
 * the cursor. Either all of a bank's changes land or none do, so a failure can't
 * skip transactions, and retries are safe because every write is an upsert.
 */
async function syncItem(
  config: PlaidConfig,
  secret: string,
  item: PlaidItem,
  { waitForFirstPull = false }: { waitForFirstPull?: boolean } = {},
): Promise<ItemCounts> {
  const accessToken = decryptToken(
    item.accessTokenEncrypted,
    secret,
    item.itemId,
  );
  const plaidAccounts = await fetchAccounts(config, accessToken);
  const changes = await fetchTransactionChanges(
    config,
    accessToken,
    item.cursor,
    { waitForFirstPull },
  );
  const investments = plaidAccounts.some(
    (account) => account.type === "investment",
  )
    ? await fetchHoldings(config, accessToken)
    : null;

  const syncedAt = new Date();
  const snapshotDate = todayInAppTimezone(syncedAt);
  const metadata = {
    item_id: item.itemId,
    institution_id: item.institutionId,
  };
  const accountValues = plaidAccounts.map((account) =>
    accountRow(account, item.institutionName, metadata, syncedAt),
  );

  return getDb().transaction(async (tx) => {
    const persisted = accountValues.length
      ? await tx
          .insert(accounts)
          .values(accountValues)
          .onConflictDoUpdate({
            target: [accounts.source, accounts.externalId],
            set: {
              institutionName: sql`excluded.institution_name`,
              name: sql`excluded.name`,
              officialName: sql`excluded.official_name`,
              accountType: sql`excluded.account_type`,
              accountSubtype: sql`excluded.account_subtype`,
              mask: sql`excluded.mask`,
              currencyCode: sql`excluded.currency_code`,
              currentBalance: sql`excluded.current_balance`,
              availableBalance: sql`excluded.available_balance`,
              connected: sql`excluded.connected`,
              lastSyncedAt: sql`excluded.last_synced_at`,
              metadata: sql`excluded.metadata`,
              updatedAt: sql`excluded.updated_at`,
            },
          })
          .returning({ id: accounts.id, externalId: accounts.externalId })
      : [];
    const accountIds = new Map(
      persisted.map((row) => [row.externalId, row.id]),
    );

    // An account closed at the bank must stop counting toward net worth.
    if (accountIds.size) {
      await tx
        .update(accounts)
        .set({ connected: false, updatedAt: syncedAt })
        .where(
          and(
            eq(accounts.source, "plaid"),
            sql`${accounts.metadata}->>'item_id' = ${item.itemId}`,
            notInArray(accounts.externalId, Array.from(accountIds.keys())),
          ),
        );

      await tx
        .insert(balanceSnapshots)
        .values(
          accountValues.map((row) => ({
            accountId: accountIds.get(row.externalId)!,
            snapshotDate,
            balance: row.currentBalance,
            availableBalance: row.availableBalance,
          })),
        )
        .onConflictDoUpdate({
          target: [balanceSnapshots.accountId, balanceSnapshots.snapshotDate],
          set: {
            balance: sql`excluded.balance`,
            availableBalance: sql`excluded.available_balance`,
          },
        });
    }

    // One batch can both add and modify a transaction, and a single upsert can't
    // touch a row twice. Modifications come last, so the latest version wins.
    const latest = new Map(
      [...changes.added, ...changes.modified].map((transaction) => [
        transaction.transaction_id,
        transaction,
      ]),
    );
    const changed = Array.from(latest.values()).flatMap((transaction) => {
      const accountId = accountIds.get(transaction.account_id);
      return accountId === undefined
        ? []
        : [transactionRow(transaction, accountId, syncedAt)];
    });
    for (const batch of batches(changed)) {
      await tx
        .insert(transactions)
        .values(batch)
        .onConflictDoUpdate({
          target: transactions.externalId,
          set: {
            accountId: sql`excluded.account_id`,
            transactionDate: sql`excluded.transaction_date`,
            authorizedDate: sql`excluded.authorized_date`,
            transactionAt: sql`excluded.transaction_at`,
            name: sql`excluded.name`,
            merchantName: sql`excluded.merchant_name`,
            amount: sql`excluded.amount`,
            // A category the owner picked outranks whatever the bank says next.
            categoryPrimary: sql`case when ${transactions.categoryLocked} then ${transactions.categoryPrimary} else excluded.category_primary end`,
            categoryDetailed: sql`case when ${transactions.categoryLocked} then ${transactions.categoryDetailed} else excluded.category_detailed end`,
            pending: sql`excluded.pending`,
            paymentChannel: sql`excluded.payment_channel`,
            currencyCode: sql`excluded.currency_code`,
            logoUrl: sql`excluded.logo_url`,
            website: sql`excluded.website`,
            rawData: sql`excluded.raw_data`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    for (const batch of batches(changes.removedIds)) {
      await tx
        .delete(transactions)
        .where(inArray(transactions.externalId, batch));
    }
    // New charges from a merchant the owner has already filed somewhere.
    await tx.execute(sql`
      update public.transactions t
      set
        category_primary = rules.category_primary,
        category_detailed = null,
        category_locked = true,
        updated_at = now()
      from public.merchant_rules rules
      where coalesce(t.merchant_name, t.name) = rules.merchant
        and t.category_locked = false
    `);
    // Plaid calls money sent through Venmo, Cash App, or Zelle a transfer, but
    // it's paying someone, so it counts as spending. Money received isn't touched:
    // it stays out of income and doesn't lower spending.
    await tx.execute(sql`
      update public.transactions
      set
        category_primary = 'PAYMENT_APPS',
        category_detailed = null,
        updated_at = now()
      where category_detailed = 'TRANSFER_OUT_TRANSFER_OUT_FROM_APPS'
        and category_locked = false
    `);
    // The paying bank often can't tell a card from a loan, so Plaid may file a
    // card payment as a generic loan payment, which would count as spending. The
    // card receiving the same amount proves what it was. This checks all history
    // because the two sides can arrive on different days, or from different banks.
    await tx.execute(sql`
      update public.transactions payment
      set
        category_detailed = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
        updated_at = now()
      where payment.amount < 0
        and payment.category_primary = 'LOAN_PAYMENTS'
        and payment.category_detailed is distinct from 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
        and payment.category_locked = false
        and exists (
          select 1
          from public.transactions received
          join public.accounts card on card.id = received.account_id
          where card.account_type = 'credit'
            and received.account_id <> payment.account_id
            and received.amount = -payment.amount
            and abs(received.transaction_date - payment.transaction_date)
              <= ${CARD_PAYMENT_MATCH_DAYS}
        )
    `);

    let holdingCount = 0;
    if (investments) {
      const rows = holdingRows(
        investments.holdings,
        investments.securities,
        accountIds,
        syncedAt,
      );
      holdingCount = rows.length;
      for (const batch of batches(rows)) {
        await tx
          .insert(holdings)
          .values(batch)
          .onConflictDoUpdate({
            target: [holdings.accountId, holdings.externalId],
            set: {
              symbol: sql`excluded.symbol`,
              name: sql`excluded.name`,
              assetType: sql`excluded.asset_type`,
              quantity: sql`excluded.quantity`,
              averageCost: sql`excluded.average_cost`,
              currentPrice: sql`excluded.current_price`,
              currentValue: sql`excluded.current_value`,
              costBasis: sql`excluded.cost_basis`,
              unrealizedGain: sql`excluded.unrealized_gain`,
              unrealizedGainPercent: sql`excluded.unrealized_gain_percent`,
              rawData: sql`excluded.raw_data`,
              syncedAt: sql`excluded.synced_at`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      }

      // Positions that were sold no longer appear, so clear them per account.
      const investmentAccountIds = plaidAccounts.flatMap((account) => {
        const id = accountIds.get(account.account_id);
        return account.type === "investment" && id !== undefined ? [id] : [];
      });
      for (const accountId of investmentAccountIds) {
        const kept = rows
          .filter((row) => row.accountId === accountId)
          .map((row) => row.externalId);
        await tx
          .delete(holdings)
          .where(
            and(
              eq(holdings.accountId, accountId),
              kept.length ? notInArray(holdings.externalId, kept) : undefined,
            ),
          );
      }

      const snapshots = investmentSnapshotRows(rows, snapshotDate);
      if (snapshots.length) {
        await tx
          .insert(investmentSnapshots)
          .values(snapshots)
          .onConflictDoUpdate({
            target: [
              investmentSnapshots.accountId,
              investmentSnapshots.snapshotDate,
            ],
            set: {
              marketValue: sql`excluded.market_value`,
              costBasis: sql`excluded.cost_basis`,
              unrealizedGain: sql`excluded.unrealized_gain`,
            },
          });
      }
    }

    await tx
      .update(plaidItems)
      .set({
        cursor: changes.nextCursor,
        status: "active",
        lastErrorCode: null,
        lastErrorMessage: null,
        lastAttemptAt: syncedAt,
        lastSuccessAt: syncedAt,
        updatedAt: syncedAt,
      })
      .where(eq(plaidItems.id, item.id));

    return {
      accounts: accountValues.length,
      transactionsAdded: changes.added.length,
      transactionsModified: changes.modified.length,
      transactionsRemoved: changes.removedIds.length,
      holdings: holdingCount,
    };
  });
}

async function recordItemFailure(item: PlaidItem, error: unknown) {
  const friendly = describePlaidError(error, item.institutionName);
  const now = new Date();
  await getDb()
    .update(plaidItems)
    .set({
      status: friendly.needsReconnect ? "login_required" : "error",
      lastErrorCode: friendly.code,
      lastErrorMessage: friendly.message,
      lastAttemptAt: now,
      updatedAt: now,
    })
    .where(eq(plaidItems.id, item.id));
  // Only the code is logged: no balances, names, or provider response bodies.
  console.error(`Sync failed for connection ${item.id}: ${friendly.code}`);
  return friendly;
}

async function alreadySyncedToday(): Promise<boolean> {
  const rows = await getDb().execute(sql`
    select 1
    from public.sync_states
    where source = ${SOURCE}
      and status = 'success'
      and (last_success_at at time zone ${appTimeZone()})::date
        = ${todayInAppTimezone()}::date
  `);
  return rows.length > 0;
}

/**
 * One atomic statement, so overlapping runs can't both start. A lock older than
 * a function's lifetime belongs to a run that crashed, and is taken over.
 */
async function acquireLock(): Promise<boolean> {
  const rows = await getDb().execute(sql`
    insert into public.sync_states (
      source, status, last_attempt_at, last_error, updated_at
    )
    values (${SOURCE}, 'running', now(), null, now())
    on conflict (source) do update
    set
      status = 'running',
      last_attempt_at = now(),
      last_error = null,
      updated_at = now()
    where sync_states.status <> 'running'
      or sync_states.last_attempt_at
        < now() - make_interval(mins => ${STALE_LOCK_MINUTES})
    returning source
  `);
  return rows.length > 0;
}

async function releaseLock(
  failures: string[],
  totals: Record<string, number>,
  connections: number,
) {
  const success = failures.length === 0;
  await getDb().execute(sql`
    update public.sync_states
    set
      status = ${success ? "success" : "failed"}::sync_status,
      last_success_at = case
        when ${success} then now()
        else last_success_at
      end,
      last_error = ${success ? null : failures.join(" ").slice(0, 1000)},
      details = ${JSON.stringify({ connections, ...totals })}::jsonb,
      updated_at = now()
    where source = ${SOURCE}
  `);
}

/**
 * Banks are independent: one expired login must not stop the others, which
 * matters more now that the next attempt is a full day away.
 */
export async function runSync(trigger: SyncTrigger): Promise<SyncOutcome> {
  const config = plaidConfig();
  const secret = appSecret();
  if (!config || !secret) {
    return { status: "skipped", reason: "not-configured" };
  }

  const db = getDb();
  const items = await db.select().from(plaidItems);
  if (!items.length) return { status: "skipped", reason: "no-connections" };

  // Vercel can deliver a cron event twice, and this keeps that to one sync.
  if (trigger === "scheduled" && (await alreadySyncedToday())) {
    return { status: "skipped", reason: "already-synced-today" };
  }
  if (!(await acquireLock())) {
    return { status: "skipped", reason: "already-running" };
  }

  const [run] = await db
    .insert(syncRuns)
    .values({ source: SOURCE, status: "running" })
    .returning({ id: syncRuns.id });

  const totals: Record<string, number> = {};
  const failures: string[] = [];
  try {
    for (const item of items) {
      try {
        const counts = await syncItem(config, secret, item);
        for (const [label, count] of Object.entries(counts)) {
          totals[label] = (totals[label] ?? 0) + count;
        }
      } catch (error) {
        const friendly = await recordItemFailure(item, error);
        failures.push(friendly.message);
      }
    }
  } finally {
    await releaseLock(failures, totals, items.length);
    await db
      .update(syncRuns)
      .set({
        status: failures.length ? "failed" : "success",
        finishedAt: new Date(),
        counts: totals,
        errorMessage: failures.length
          ? failures.join(" ").slice(0, 1000)
          : null,
      })
      .where(eq(syncRuns.id, run.id));
  }

  if (!failures.length) {
    return { status: "success", connections: items.length };
  }
  return {
    status: failures.length === items.length ? "failed" : "partial",
    connections: items.length,
    failed: failures.length,
  };
}

/**
 * Pulls one newly linked or repaired connection right away, instead of leaving
 * it empty until tomorrow morning. Failures are recorded, never thrown, because
 * this runs after the response has already gone out.
 */
export async function syncSingleItem(itemRowId: number): Promise<void> {
  const config = plaidConfig();
  const secret = appSecret();
  if (!config || !secret) return;

  const [item] = await getDb()
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.id, itemRowId));
  if (!item) return;

  try {
    await syncItem(config, secret, item, { waitForFirstPull: true });
  } catch (error) {
    await recordItemFailure(item, error);
  }
}
