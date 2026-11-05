import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { setupIssues, type SetupIssue } from "@/lib/app-config";
import { requireSession } from "@/lib/auth";
import { getSubscriptionsData } from "@/lib/detail-data";
import {
  COUNTS_AS_CASH_FLOW,
  INCOME_TOTAL,
  IS_INCOME,
  SPENDING_TOTAL,
} from "@/lib/finance-sql";
import {
  appTimeZone,
  monthStartInAppTimezone,
  sameDayLastMonth,
  subtractDays,
  todayInAppTimezone,
} from "@/lib/timezone";

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
  accountType: string;
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

export type UpcomingBill = {
  merchant: string;
  amount: number;
  expectedAt: string;
};

export type AttentionItem = {
  id: number;
  institution: string;
  message: string;
  needsReconnect: boolean;
};

export type DataHealth = {
  hasConnections: boolean;
  lastUpdatedAt: string | null;
  stale: boolean;
  attention: AttentionItem[];
};

export type DashboardData = {
  metrics: {
    netWorth: number;
    netWorthChange: number | null;
    netWorthChangePercent: number | null;
    /** The date the change is measured from. */
    netWorthChangeSince: string | null;
    monthlyCashFlow: number;
    monthlyIncome: number;
    monthlySpending: number;
    investmentValue: number;
    cashOnHand: number;
    moneyOwed: number;
    /** Spending through this same day last month; null without that history. */
    spentByThisPointLastMonth: number | null;
  };
  trend: TrendPoint[];
  spending: SpendingPoint[];
  accounts: AccountRow[];
  recentTransactions: RecentTransaction[];
  upcomingBills: UpcomingBill[];
  health: DataHealth;
};

type Row = Record<string, unknown>;

/** A daily update plus Vercel's up-to-an-hour timing window, with some slack. */
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;
const UPCOMING_WINDOW_MS = 30 * 86_400_000;
const UPCOMING_BILL_LIMIT = 5;

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isStale(lastUpdatedAt: string | null): boolean {
  if (!lastUpdatedAt) return false;
  return Date.now() - new Date(lastUpdatedAt).getTime() > STALE_AFTER_MS;
}

export async function getDashboardData(): Promise<DashboardData> {
  await requireSession();
  const db = getDb();
  const today = todayInAppTimezone();
  const monthStart = monthStartInAppTimezone();
  const lastMonthPoint = sameDayLastMonth(today);
  const lastMonthStart = `${lastMonthPoint.slice(0, 7)}-01`;

  // One round trip matters on a serverless-to-hosted database connection.
  // PostgreSQL builds the small dashboard DTO without exposing a general API.
  const dashboardQuery = db.execute(sql`
    with
      balances as (
        select
          coalesce(sum(current_balance), 0)::float8 as net_worth,
          coalesce(sum(coalesce(available_balance, current_balance)) filter (
            where account_type = 'depository'
          ), 0)::float8 as cash_on_hand,
          coalesce(abs(sum(current_balance) filter (
            where account_type in ('credit', 'loan')
          )), 0)::float8 as money_owed,
          coalesce(sum(current_balance) filter (
            where account_type = 'investment'
          ), 0)::float8 as investment_value,
          count(*)::int as connected_accounts
        from public.accounts
        where connected = true
      ),
      cash_flow as (
        select
          ${INCOME_TOTAL} as income,
          ${SPENDING_TOTAL} as spending
        from public.transactions
        where transaction_date >= ${monthStart}::date
          and transaction_date < ${monthStart}::date + interval '1 month'
          and ${COUNTS_AS_CASH_FLOW}
      ),
      last_month as (
        select
          ${SPENDING_TOTAL} as spent,
          count(*)::int as transactions
        from public.transactions
        where transaction_date >= ${lastMonthStart}::date
          and transaction_date <= ${lastMonthPoint}::date
          and ${COUNTS_AS_CASH_FLOW}
      ),
      trend_days as (
        select generate_series(
          greatest(
            (select min(snapshot_date) from public.balance_snapshots),
            ${today}::date - 365
          ),
          ${today}::date,
          interval '1 day'
        )::date as day
      ),
      -- Each account's latest known balance on each day. A day an account
      -- couldn't update then repeats its last value, instead of the whole
      -- account vanishing and showing as a fake drop in net worth.
      trend_rows as (
        select trend_days.day::text as date, sum(known.balance)::float8 as value
        from trend_days
        cross join public.accounts
        cross join lateral (
          select balance
          from public.balance_snapshots
          where account_id = accounts.id
            and snapshot_date <= trend_days.day
          order by snapshot_date desc
          limit 1
        ) known
        where accounts.connected = true
        group by trend_days.day
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
          coalesce(category_primary, 'OTHER') as category,
          sum(-amount)::float8 as value
        from public.transactions
        where transaction_date >= ${monthStart}::date
          and transaction_date < ${monthStart}::date + interval '1 month'
          and ${COUNTS_AS_CASH_FLOW}
          and not ${IS_INCOME}
        group by coalesce(category_primary, 'OTHER')
        having sum(-amount) > 0
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
          account_type,
          mask,
          source::text,
          current_balance::float8 as balance,
          connected,
          last_synced_at::text
        from public.accounts
        where connected = true
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
          coalesce(t.transaction_at, t.transaction_date::timestamp at time zone ${appTimeZone()}) as sort_at
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
      health as (
        select
          greatest(
            (select max(last_success_at) from public.plaid_items),
            (select last_success_at from public.sync_states where source = 'plaid')
          )::text as last_updated_at,
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', id,
                'institution', institution_name,
                'message', last_error_message,
                'needs_reconnect', status = 'login_required'
              )
              order by institution_name
            )
            from public.plaid_items
            where status <> 'active'
          ), '[]'::jsonb) as attention
      )
    select
      balances.*,
      cash_flow.income,
      cash_flow.spending,
      last_month.spent as last_month_spent,
      last_month.transactions as last_month_transactions,
      trend.data as trend,
      spending.data as spending_by_category,
      account_data.data as accounts,
      transaction_data.data as recent_transactions,
      health.last_updated_at,
      health.attention
    from balances, cash_flow, last_month, trend, spending, account_data,
      transaction_data, health
  `);

  const [dashboardResult, subscriptions] = await Promise.all([
    dashboardQuery,
    getSubscriptionsData(),
  ]);

  const dashboard = dashboardResult[0] as Row | undefined;
  const rowsOf = (value: unknown) => (Array.isArray(value) ? (value as Row[]) : []);

  const trend = rowsOf(dashboard?.trend).map((row) => ({
    date: String(row.date),
    value: numberValue(row.value),
  }));
  // Measured from 90 days ago, or from the first day of history if that's newer.
  // A single day of history has nothing to compare against.
  const cutoffDate = subtractDays(today, 90);
  const baseline =
    trend.length > 1
      ? trend.find((point) => point.date >= cutoffDate)
      : undefined;
  const priorValue = baseline?.value;
  const netWorth = numberValue(dashboard?.net_worth);
  const netWorthChange =
    priorValue !== undefined ? netWorth - priorValue : null;
  const income = numberValue(dashboard?.income);
  const spending = numberValue(dashboard?.spending);

  const now = Date.now();
  const upcomingBills = subscriptions.subscriptions
    .map((item) => ({
      merchant: item.merchant,
      amount: item.averageAmount,
      expectedAt: item.nextExpectedAt,
    }))
    .filter((bill) => {
      const expected = Date.parse(bill.expectedAt);
      return expected >= now && expected <= now + UPCOMING_WINDOW_MS;
    })
    .sort((a, b) => Date.parse(a.expectedAt) - Date.parse(b.expectedAt))
    .slice(0, UPCOMING_BILL_LIMIT);

  const lastUpdatedAt = dashboard?.last_updated_at?.toString() ?? null;

  return {
    metrics: {
      netWorth,
      netWorthChange,
      netWorthChangePercent:
        netWorthChange !== null && priorValue
          ? (netWorthChange / Math.abs(priorValue)) * 100
          : null,
      netWorthChangeSince: baseline?.date ?? null,
      monthlyCashFlow: income - spending,
      monthlyIncome: income,
      monthlySpending: spending,
      investmentValue: numberValue(dashboard?.investment_value),
      cashOnHand: numberValue(dashboard?.cash_on_hand),
      moneyOwed: numberValue(dashboard?.money_owed),
      spentByThisPointLastMonth: numberValue(dashboard?.last_month_transactions)
        ? numberValue(dashboard?.last_month_spent)
        : null,
    },
    trend,
    spending: rowsOf(dashboard?.spending_by_category).map((row) => ({
      category: String(row.category),
      value: numberValue(row.value),
    })),
    accounts: rowsOf(dashboard?.accounts).map((row) => ({
      id: numberValue(row.id),
      institutionName: String(row.institution_name),
      name: String(row.name),
      type: String(row.type),
      accountType: String(row.account_type),
      mask: row.mask ? String(row.mask) : null,
      source: String(row.source),
      balance: numberValue(row.balance),
      connected: Boolean(row.connected),
      lastSyncedAt: row.last_synced_at
        ? String(row.last_synced_at)
        : null,
    })),
    recentTransactions: rowsOf(dashboard?.recent_transactions).map((row) => ({
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
    upcomingBills,
    health: {
      hasConnections: numberValue(dashboard?.connected_accounts) > 0,
      lastUpdatedAt,
      stale: isStale(lastUpdatedAt),
      attention: rowsOf(dashboard?.attention).map((row) => ({
        id: numberValue(row.id),
        institution: String(row.institution),
        message: String(row.message ?? ""),
        needsReconnect: Boolean(row.needs_reconnect),
      })),
    },
  };
}

export type ConnectionAccount = {
  name: string;
  mask: string | null;
  type: string;
  balance: number;
};

export type ConnectionRow = {
  id: number;
  institutionName: string;
  state: "connected" | "importing" | "needs-reconnect" | "trouble";
  message: string | null;
  lastSuccessAt: string | null;
  accounts: ConnectionAccount[];
};

export type ConnectionsData = {
  connections: ConnectionRow[];
  issues: SetupIssue[];
  /** Accounts that exist but have no saved connection, from an older version. */
  unmanagedAccounts: number;
};

function connectionState(row: Row): ConnectionRow["state"] {
  if (row.status === "login_required") return "needs-reconnect";
  if (row.status === "error") return "trouble";
  return row.last_success_at ? "connected" : "importing";
}

export async function getConnectionsData(): Promise<ConnectionsData> {
  await requireSession();
  // Columns are listed by hand so the encrypted token can never ride along.
  const rows = await getDb().execute(sql`
    select
      items.id,
      items.institution_name,
      items.status::text as status,
      items.last_error_message,
      items.last_success_at::text as last_success_at,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'name', a.name,
              'mask', a.mask,
              'type', coalesce(a.account_subtype, a.account_type),
              'balance', a.current_balance::float8
            )
            order by a.current_balance desc
          )
          from public.accounts a
          where a.connected = true
            and a.metadata->>'item_id' = items.item_id
        ),
        '[]'::jsonb
      ) as accounts,
      (
        select count(*)::int
        from public.accounts a
        where a.connected = true
          and not exists (
            select 1 from public.plaid_items known
            where known.item_id = a.metadata->>'item_id'
          )
      ) as unmanaged_accounts
    from public.plaid_items items
    order by items.institution_name, items.id
  `);

  let unmanagedAccounts = numberValue((rows[0] as Row | undefined)?.unmanaged_accounts);
  if (!rows.length) {
    const [orphans] = await getDb().execute(sql`
      select count(*)::int as count from public.accounts where connected = true
    `);
    unmanagedAccounts = numberValue((orphans as Row | undefined)?.count);
  }

  return {
    connections: (rows as Row[]).map((row) => ({
      id: numberValue(row.id),
      institutionName: String(row.institution_name),
      state: connectionState(row),
      message: row.last_error_message ? String(row.last_error_message) : null,
      lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
      accounts: (Array.isArray(row.accounts) ? (row.accounts as Row[]) : []).map(
        (account) => ({
          name: String(account.name),
          mask: account.mask ? String(account.mask) : null,
          type: String(account.type),
          balance: numberValue(account.balance),
        }),
      ),
    })),
    issues: setupIssues().filter(
      (issue) => issue.key === "plaid" || issue.key === "secret",
    ),
    unmanagedAccounts,
  };
}
