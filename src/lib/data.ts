import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth";

export type TrendPoint = {
  date: string;
  value: number;
};

export type SpendingPoint = {
  category: string;
  value: number;
};

export type AccountRow = {
  id: number;
  institutionName: string;
  name: string;
  type: string;
  mask: string | null;
  source: string;
  balance: number;
  availableBalance?: number | null;
  connected: boolean;
  lastSyncedAt: string | null;
};

export type RecentTransaction = {
  id: number;
  date: string;
  transactionAt: string | null;
  name: string;
  merchantName: string | null;
  category: string | null;
  amount: number;
  accountName: string;
  pending: boolean;
};

export type DashboardData = {
  metrics: {
    netWorth: number;
    netWorthChange: number | null;
    netWorthChangePercent: number | null;
    monthlyCashFlow: number;
    monthlyIncome: number;
    monthlySpending: number;
    investmentValue: number;
  };
  trend: TrendPoint[];
  spending: SpendingPoint[];
  accounts: AccountRow[];
  recentTransactions: RecentTransaction[];
  lastSuccessfulSync: string | null;
  completedSyncAt: string | null;
  failedSyncAt: string | null;
};

type Row = Record<string, unknown>;

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthStartInAppTimezone(): string {
  const timeZone = process.env.APP_TIMEZONE ?? "America/New_York";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone,
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}-01`;
}

export async function getDashboardData(): Promise<DashboardData> {
  await requireSession();
  const db = getDb();
  const monthStart = monthStartInAppTimezone();

  // One round trip matters on a serverless-to-hosted database connection.
  // PostgreSQL builds the small dashboard DTO without exposing a general API.
  const dashboardResult = await db.execute(sql`
    with
      metric as (
        select coalesce(sum(current_balance), 0)::float8 as net_worth
        from public.accounts
        where connected = true
      ),
      cash_flow as (
        select
          coalesce(sum(amount), 0)::float8 as cash_flow,
          coalesce(sum(amount) filter (where amount > 0), 0)::float8 as income,
          coalesce(abs(sum(amount) filter (where amount < 0)), 0)::float8 as spending
        from public.transactions
        where transaction_date >= ${monthStart}::date
          and pending = false
          and coalesce(category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT')
      ),
      investment as (
        select coalesce(sum(current_value), 0)::float8 as investment_value
        from public.holdings
      ),
      trend_rows as (
        select snapshot_date::text as date, sum(balance)::float8 as value
        from public.balance_snapshots
        where snapshot_date >= current_date - interval '365 days'
        group by snapshot_date
      ),
      trend as (
        select coalesce(
          jsonb_agg(jsonb_build_object('date', date, 'value', value) order by date),
          '[]'::jsonb
        ) as data
        from trend_rows
      ),
      spending_rows as (
        select
          coalesce(category_primary, 'Other') as category,
          abs(sum(amount))::float8 as value
        from public.transactions
        where transaction_date >= current_date - interval '30 days'
          and amount < 0
          and pending = false
          and coalesce(category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT')
        group by coalesce(category_primary, 'Other')
        order by value desc
        limit 7
      ),
      spending as (
        select coalesce(
          jsonb_agg(
            jsonb_build_object('category', category, 'value', value)
            order by value desc
          ),
          '[]'::jsonb
        ) as data
        from spending_rows
      ),
      account_rows as (
        select
          id,
          institution_name,
          name,
          coalesce(account_subtype, account_type) as type,
          mask,
          source::text,
          current_balance::float8 as balance,
          connected,
          last_synced_at::text
        from public.accounts
        order by current_balance desc, name
      ),
      account_data as (
        select coalesce(
          jsonb_agg(to_jsonb(account_rows) order by balance desc, name),
          '[]'::jsonb
        ) as data
        from account_rows
      ),
      transaction_rows as (
        select
          t.id,
          t.transaction_date::text as date,
          t.transaction_at::text as transaction_at,
          t.name,
          t.merchant_name,
          t.category_primary as category,
          t.amount::float8 as amount,
          t.pending,
          a.name as account_name,
          coalesce(t.transaction_at, t.transaction_date::timestamp at time zone ${process.env.APP_TIMEZONE ?? "America/New_York"}) as sort_at
        from public.transactions t
        join public.accounts a on a.id = t.account_id
        order by sort_at desc, t.id desc
        limit 8
      ),
      transaction_data as (
        select coalesce(
          jsonb_agg(
            to_jsonb(transaction_rows) - 'sort_at'
            order by sort_at desc, id desc
          ),
          '[]'::jsonb
        ) as data
        from transaction_rows
      ),
      sync_data as (
        select
          max(last_success_at)::text as last_success,
          min(last_success_at) filter (
            where source in (
              select distinct source::text
              from public.accounts
              where connected = true
            )
          )::text as completed_sync_at,
          max(last_attempt_at) filter (
            where status = 'failed'
          )::text as failed_sync_at
        from public.sync_states
      )
    select
      metric.net_worth,
      cash_flow.cash_flow,
      cash_flow.income,
      cash_flow.spending,
      investment.investment_value,
      trend.data as trend,
      spending.data as spending_by_category,
      account_data.data as accounts,
      transaction_data.data as recent_transactions,
      sync_data.last_success,
      sync_data.completed_sync_at,
      sync_data.failed_sync_at
    from metric, cash_flow, investment, trend, spending, account_data,
      transaction_data, sync_data
  `);

  const dashboard = dashboardResult[0] as Row | undefined;
  const trendRows = Array.isArray(dashboard?.trend) ? dashboard.trend : [];
  const spendingRows = Array.isArray(dashboard?.spending_by_category)
    ? dashboard.spending_by_category
    : [];
  const accountRows = Array.isArray(dashboard?.accounts)
    ? dashboard.accounts
    : [];
  const transactionRows = Array.isArray(dashboard?.recent_transactions)
    ? dashboard.recent_transactions
    : [];
  const trend = (trendRows as Row[]).map((row) => ({
    date: String(row.date),
    value: numberValue(row.value),
  }));
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const priorValue =
    trend.find((point) => point.date >= cutoffDate)?.value ??
    (trend.length > 1 ? trend.at(0)?.value : undefined);
  const netWorth = numberValue(dashboard?.net_worth);
  const netWorthChange =
    priorValue !== undefined ? netWorth - priorValue : null;

  return {
    metrics: {
      netWorth,
      netWorthChange,
      netWorthChangePercent:
        netWorthChange !== null && priorValue
          ? (netWorthChange / Math.abs(priorValue)) * 100
          : null,
      monthlyCashFlow: numberValue(dashboard?.cash_flow),
      monthlyIncome: numberValue(dashboard?.income),
      monthlySpending: numberValue(dashboard?.spending),
      investmentValue: numberValue(dashboard?.investment_value),
    },
    trend,
    spending: (spendingRows as Row[]).map((row) => ({
      category: String(row.category),
      value: numberValue(row.value),
    })),
    accounts: (accountRows as Row[]).map((row) => ({
      id: numberValue(row.id),
      institutionName: String(row.institution_name),
      name: String(row.name),
      type: String(row.type),
      mask: row.mask ? String(row.mask) : null,
      source: String(row.source),
      balance: numberValue(row.balance),
      connected: Boolean(row.connected),
      lastSyncedAt: row.last_synced_at
        ? String(row.last_synced_at)
        : null,
    })),
    recentTransactions: (transactionRows as Row[]).map((row) => ({
      id: numberValue(row.id),
      date: String(row.date),
      transactionAt: row.transaction_at ? String(row.transaction_at) : null,
      name: String(row.name),
      merchantName: row.merchant_name ? String(row.merchant_name) : null,
      category: row.category ? String(row.category) : null,
      amount: numberValue(row.amount),
      accountName: String(row.account_name),
      pending: Boolean(row.pending),
    })),
    lastSuccessfulSync: dashboard?.last_success?.toString() ?? null,
    completedSyncAt: dashboard?.completed_sync_at?.toString() ?? null,
    failedSyncAt: dashboard?.failed_sync_at?.toString() ?? null,
  };
}

export type SetupSource = {
  source: "plaid" | "robinhood";
  status: "connected" | "needs-attention" | "pending" | "optional";
  label: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  accounts: number;
  connections: number;
  institutions: string[];
};

export type SetupData = {
  database: "connected";
  sources: SetupSource[];
  totalAccounts: number;
};

export async function getSetupData(): Promise<SetupData> {
  await requireSession();
  const db = getDb();
  const setupResult = await db.execute(sql`
    with
      state_rows as (
        select
          source,
          status::text,
          last_attempt_at::text,
          last_success_at::text,
          last_error
        from public.sync_states
        where source in ('plaid', 'robinhood')
      ),
      account_rows as (
        select
          source::text,
          count(*)::int as count,
          count(distinct coalesce(metadata->>'item_id', external_id))::int
            as connections,
          array_agg(distinct institution_name order by institution_name)
            as institutions
        from public.accounts
        group by source
      )
    select
      coalesce((select jsonb_agg(to_jsonb(state_rows)) from state_rows), '[]'::jsonb) as states,
      coalesce((select jsonb_agg(to_jsonb(account_rows)) from account_rows), '[]'::jsonb) as account_counts
  `);
  const setup = setupResult[0] as Row | undefined;
  const stateRows = Array.isArray(setup?.states) ? setup.states : [];
  const countRows = Array.isArray(setup?.account_counts)
    ? setup.account_counts
    : [];
  const states = new Map(
    (stateRows as Row[]).map((row) => [String(row.source), row]),
  );
  const counts = new Map(
    (countRows as Row[]).map((row) => [
      String(row.source),
      numberValue(row.count),
    ]),
  );
  const connectionCounts = new Map(
    (countRows as Row[]).map((row) => [
      String(row.source),
      numberValue(row.connections),
    ]),
  );
  const institutions = new Map(
    (countRows as Row[]).map((row) => [
      String(row.source),
      Array.isArray(row.institutions)
        ? row.institutions.map(String)
        : [],
    ]),
  );

  const sources: SetupSource[] = (["plaid", "robinhood"] as const).map((source) => {
    const state = states.get(source);
    const accountCount = counts.get(source) ?? 0;
    const rawStatus = state?.status?.toString();
    let status: SetupSource["status"] =
      source === "robinhood" ? "optional" : "pending";
    if (rawStatus === "failed") status = "needs-attention";
    else if (rawStatus === "success" && accountCount > 0) status = "connected";

    return {
      source,
      status,
      label: source === "plaid" ? "Plaid institutions" : "Robinhood",
      lastAttemptAt: state?.last_attempt_at?.toString() ?? null,
      lastSuccessAt: state?.last_success_at?.toString() ?? null,
      lastError: state?.last_error?.toString() ?? null,
      accounts: accountCount,
      connections: connectionCounts.get(source) ?? 0,
      institutions: institutions.get(source) ?? [],
    };
  });

  return {
    database: "connected",
    sources,
    totalAccounts: Array.from(counts.values()).reduce(
      (total, count) => total + count,
      0,
    ),
  };
}
