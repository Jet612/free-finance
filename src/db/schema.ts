import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const accountSource = pgEnum("account_source", [
  "plaid",
  "robinhood",
  "manual",
]);

export const syncStatus = pgEnum("sync_status", [
  "running",
  "success",
  "failed",
  "skipped",
]);

export const accounts = pgTable(
  "accounts",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    source: accountSource().notNull(),
    externalId: text("external_id").notNull(),
    institutionName: text("institution_name").notNull(),
    name: text().notNull(),
    officialName: text("official_name"),
    accountType: text("account_type").notNull(),
    accountSubtype: text("account_subtype"),
    mask: text(),
    currencyCode: text("currency_code").notNull().default("USD"),
    currentBalance: numeric("current_balance", {
      precision: 19,
      scale: 4,
    })
      .notNull()
      .default("0"),
    availableBalance: numeric("available_balance", {
      precision: 19,
      scale: 4,
    }),
    connected: boolean().notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", {
      withTimezone: true,
      mode: "date",
    }),
    metadata: jsonb().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("accounts_source_external_id_uidx").on(
      table.source,
      table.externalId,
    ),
    index("accounts_source_connected_idx").on(table.source, table.connected),
  ],
);

export const balanceSnapshots = pgTable(
  "balance_snapshots",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    accountId: bigint("account_id", { mode: "number" })
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    balance: numeric({ precision: 19, scale: 4 }).notNull(),
    availableBalance: numeric("available_balance", {
      precision: 19,
      scale: 4,
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("balance_snapshots_account_date_uidx").on(
      table.accountId,
      table.snapshotDate,
    ),
    index("balance_snapshots_date_idx").on(table.snapshotDate),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    accountId: bigint("account_id", { mode: "number" })
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    authorizedDate: date("authorized_date", { mode: "string" }),
    // Plaid only supplies a time for some transactions. Keep it nullable so
    // posted-date-only records are never given a made-up time in the UI.
    transactionAt: timestamp("transaction_at", {
      withTimezone: true,
      mode: "date",
    }),
    name: text().notNull(),
    merchantName: text("merchant_name"),
    // Positive means money in; negative means money out across every source.
    amount: numeric({ precision: 19, scale: 4 }).notNull(),
    categoryPrimary: text("category_primary"),
    categoryDetailed: text("category_detailed"),
    pending: boolean().notNull().default(false),
    paymentChannel: text("payment_channel"),
    currencyCode: text("currency_code").notNull().default("USD"),
    logoUrl: text("logo_url"),
    website: text(),
    rawData: jsonb("raw_data").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("transactions_external_id_uidx").on(table.externalId),
    index("transactions_account_date_idx").on(
      table.accountId,
      table.transactionDate,
    ),
    index("transactions_date_idx").on(table.transactionDate),
    index("transactions_at_idx").on(table.transactionAt),
    index("transactions_category_date_idx").on(
      table.categoryPrimary,
      table.transactionDate,
    ),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    categoryPrimary: text("category_primary").notNull(),
    monthlyLimit: numeric("monthly_limit", {
      precision: 19,
      scale: 4,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("budgets_category_primary_uidx").on(table.categoryPrimary),
    check("budgets_monthly_limit_positive", sql`${table.monthlyLimit} > 0`),
  ],
);

export const subscriptionRules = pgTable(
  "subscription_rules",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    // The detector's normalized merchant + detailed category fingerprint.
    streamKey: text("stream_key").notNull(),
    ruleType: text("rule_type").notNull(),
    merchantName: text("merchant_name").notNull(),
    categoryPrimary: text("category_primary"),
    categoryDetailed: text("category_detailed"),
    cadence: text(),
    amount: numeric({ precision: 19, scale: 4 }),
    lastChargedAt: timestamp("last_charged_at", {
      withTimezone: true,
      mode: "date",
    }),
    sourceTransactionId: bigint("source_transaction_id", {
      mode: "number",
    }).references(() => transactions.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("subscription_rules_stream_key_uidx").on(table.streamKey),
    index("subscription_rules_source_transaction_idx").on(
      table.sourceTransactionId,
    ),
    check(
      "subscription_rules_valid_type",
      sql`${table.ruleType} in ('included', 'excluded')`,
    ),
    check(
      "subscription_rules_valid_inclusion",
      sql`(
        (
          ${table.ruleType} = 'excluded'
          and ${table.cadence} is null
          and ${table.amount} is null
          and ${table.lastChargedAt} is null
        )
        or
        (
          ${table.ruleType} = 'included'
          and ${table.cadence} in ('weekly', 'biweekly', 'monthly', 'quarterly', 'annual')
          and ${table.amount} > 0
          and ${table.lastChargedAt} is not null
        )
      )`,
    ),
  ],
);

export const holdings = pgTable(
  "holdings",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    accountId: bigint("account_id", { mode: "number" })
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    symbol: text().notNull(),
    name: text().notNull(),
    assetType: text("asset_type").notNull(),
    quantity: numeric({ precision: 28, scale: 10 }).notNull(),
    averageCost: numeric("average_cost", { precision: 19, scale: 6 }),
    currentPrice: numeric("current_price", { precision: 19, scale: 6 }),
    currentValue: numeric("current_value", {
      precision: 19,
      scale: 4,
    }).notNull(),
    costBasis: numeric("cost_basis", { precision: 19, scale: 4 }),
    unrealizedGain: numeric("unrealized_gain", {
      precision: 19,
      scale: 4,
    }),
    unrealizedGainPercent: numeric("unrealized_gain_percent", {
      precision: 12,
      scale: 6,
    }),
    rawData: jsonb("raw_data").notNull().default({}),
    syncedAt: timestamp("synced_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("holdings_account_external_id_uidx").on(
      table.accountId,
      table.externalId,
    ),
    index("holdings_account_id_idx").on(table.accountId),
    index("holdings_asset_type_idx").on(table.assetType),
    check("holdings_quantity_nonnegative", sql`${table.quantity} >= 0`),
  ],
);

export const investmentSnapshots = pgTable(
  "investment_snapshots",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    accountId: bigint("account_id", { mode: "number" })
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    marketValue: numeric("market_value", {
      precision: 19,
      scale: 4,
    }).notNull(),
    costBasis: numeric("cost_basis", {
      precision: 19,
      scale: 4,
    }).notNull(),
    unrealizedGain: numeric("unrealized_gain", {
      precision: 19,
      scale: 4,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("investment_snapshots_account_date_uidx").on(
      table.accountId,
      table.snapshotDate,
    ),
    index("investment_snapshots_date_idx").on(table.snapshotDate),
  ],
);

export const syncStates = pgTable("sync_states", {
  source: text().primaryKey(),
  cursor: text(),
  status: syncStatus().notNull().default("skipped"),
  lastAttemptAt: timestamp("last_attempt_at", {
    withTimezone: true,
    mode: "date",
  }),
  lastSuccessAt: timestamp("last_success_at", {
    withTimezone: true,
    mode: "date",
  }),
  lastError: text("last_error"),
  details: jsonb().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    source: text().notNull(),
    status: syncStatus().notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", {
      withTimezone: true,
      mode: "date",
    }),
    counts: jsonb().notNull().default({}),
    errorMessage: text("error_message"),
  },
  (table) => [index("sync_runs_source_started_idx").on(table.source, table.startedAt)],
);

export type Account = typeof accounts.$inferSelect;
export type BalanceSnapshot = typeof balanceSnapshots.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type SubscriptionRule = typeof subscriptionRules.$inferSelect;
export type Holding = typeof holdings.$inferSelect;
