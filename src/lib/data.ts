import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { setupIssues, type SetupIssue } from "@/lib/app-config";
import { requireSession } from "@/lib/auth";
import {
  summarizeDashboard,
  type DashboardSummary,
} from "@/lib/dashboard-summary";
import {
  getBudgetsData,
  getSubscriptionsData,
  type BudgetRow,
} from "@/lib/detail-data";
import { safePlaidLogoUrl } from "@/lib/external-url";
import {
  COUNTS_AS_CASH_FLOW,
  INCOME_TOTAL,
  IS_INCOME,
  netWorthTrendCtes,
  SPENDING_TOTAL,
} from "@/lib/finance-sql";
import type { MonthlyFlow } from "@/lib/insights";
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
  /** Its bank connection is broken, so this balance may be old. */
  outOfDate?: boolean;
  /** False when the owner has left this account out of their totals. */
  inNetWorth?: boolean;
  /** Recent daily balances, oldest first. Only on the accounts page. */
  history?: TrendPoint[];
  /** The change over the past 30 days, when there's that much history. */
  change30Days?: number | null;
};

export type RecentTransaction = {
  id: number;
  date: string;
  transactionAt: string | null;
  name: string;
  merchantName: string | null;
  category: string | null;
  categoryDetailed: string | null;
  amount: number;
  accountName: string;
  pending: boolean;
  logoUrl: string | null;
};

export type UpcomingBill = {
  merchant: string;
  amount: number;
  expectedAt: string;
  category: string | null;
  cadence: string;
  /** A credit card payment, which links to the card rather than past charges. */
  kind?: "card";
};

export type AttentionItem = {
  id: number;
  institution: string;
  message: string;
  needsReconnect: boolean;
  /** The last good update, so a warning can say how old the numbers are. */
  lastSuccessAt: string | null;
};

export type DataHealth = {
  hasConnections: boolean;
  /** A bank is connected but its first update hasn't finished. */
  importing: boolean;
  lastUpdatedAt: string | null;
  stale: boolean;
  attention: AttentionItem[];
};

export type DashboardData = DashboardSummary & {
  /** The owner's calendar date, so every page agrees on what "today" is. */
  today: string;
  monthly: MonthlyFlow[];
  budgets: BudgetRow[];
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
  health: DataHealth;
};

type Row = Record<string, unknown>;

/** A daily update plus Vercel's up-to-an-hour timing window, with some slack. */
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

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
          and in_net_worth = true
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
      ${netWorthTrendCtes(today)},
      monthly_rows as (
        select
          date_trunc('month', transaction_date)::date::text as month,
          ${INCOME_TOTAL} as income,
          ${SPENDING_TOTAL} as spending
        from public.transactions
        where transaction_date >= ${monthStart}::date - interval '6 months'
          and transaction_date < ${monthStart}::date + interval '1 month'
          and ${COUNTS_AS_CASH_FLOW}
        group by date_trunc('month', transaction_date)::date
      ),
      monthly_data as (
        select coalesce(
          jsonb_agg(to_jsonb(monthly_rows) order by month),
          '[]'::jsonb
        ) as data
        from monthly_rows
      ),
      -- Net of refunds, so a month's days add up to that month's spending.
      daily_rows as (
        select
          transaction_date::text as date,
          coalesce(merchant_name, name) as merchant,
          coalesce(-sum(amount) filter (where not ${IS_INCOME}), 0)::float8 as value
        from public.transactions
        where transaction_date >= ${monthStart}::date - interval '3 months'
          and transaction_date < ${monthStart}::date + interval '1 month'
          and ${COUNTS_AS_CASH_FLOW}
        group by transaction_date, coalesce(merchant_name, name)
      ),
      daily_data as (
        select coalesce(
          jsonb_agg(to_jsonb(daily_rows) order by date),
          '[]'::jsonb
        ) as data
        from daily_rows
      ),
      -- Charges this week well above what's normal at the same merchant.
      unusual_rows as (
        select
          t.id,
          t.category_primary as category,
          coalesce(t.merchant_name, t.name) as merchant,
          (-t.amount)::float8 as amount,
          typical.median as typical,
          t.transaction_date::text as date
        from public.transactions t
        cross join lateral (
          select
            percentile_cont(0.5) within group (order by -past.amount)::float8 as median,
            count(*)::int as charges
          from public.transactions past
          where coalesce(past.merchant_name, past.name) =
              coalesce(t.merchant_name, t.name)
            and past.amount < 0
            and past.pending = false
            and past.id <> t.id
            and past.transaction_date >= t.transaction_date - 180
            and past.transaction_date < t.transaction_date
        ) typical
        where t.transaction_date >= ${today}::date - 6
          and t.amount < 0
          and coalesce(t.category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT')
          and coalesce(t.category_detailed, '') <> 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
          and typical.charges >= 3
          and -t.amount >= greatest(50, typical.median * 2.5)
        order by t.amount
        limit 3
      ),
      unusual_data as (
        select coalesce(
          jsonb_agg(to_jsonb(unusual_rows) order by amount desc),
          '[]'::jsonb
        ) as data
        from unusual_rows
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
          available_balance::float8 as available_balance,
          connected,
          in_net_worth,
          last_synced_at::text,
          exists (
            select 1 from public.plaid_items items
            where items.item_id = accounts.metadata->>'item_id'
              and items.status <> 'active'
          ) as out_of_date
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
          t.category_detailed,
          t.amount::float8 as amount,
          t.pending,
          t.logo_url,
          a.name as account_name,
          coalesce(t.transaction_at, t.transaction_date::timestamp at time zone ${appTimeZone()}) as sort_at
        from public.transactions t
        join public.accounts a on a.id = t.account_id
        where coalesce(t.category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT')
          and coalesce(t.category_detailed, '') <> 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
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
          exists (
            select 1 from public.plaid_items
            where status = 'active' and last_success_at is null
          ) as importing,
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', id,
                'institution', institution_name,
                'message', last_error_message,
                'needs_reconnect', status = 'login_required',
                'last_success_at', last_success_at
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
      monthly_data.data as monthly,
      daily_data.data as daily,
      unusual_data.data as unusual,
      spending.data as spending_by_category,
      account_data.data as accounts,
      transaction_data.data as recent_transactions,
      health.last_updated_at,
      health.importing,
      health.attention
    from balances, cash_flow, last_month, trend, monthly_data, daily_data,
      unusual_data, spending, account_data, transaction_data, health
  `);

  const [dashboardResult, subscriptions, budgets] = await Promise.all([
    dashboardQuery,
    getSubscriptionsData(),
    getBudgetsData(),
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

  const lastUpdatedAt = dashboard?.last_updated_at?.toString() ?? null;
  const cashOnHand = numberValue(dashboard?.cash_on_hand);
  const accounts: AccountRow[] = rowsOf(dashboard?.accounts).map((row) => ({
    id: numberValue(row.id),
    institutionName: String(row.institution_name),
    name: String(row.name),
    type: String(row.type),
    accountType: String(row.account_type),
    mask: row.mask ? String(row.mask) : null,
    source: String(row.source),
    balance: numberValue(row.balance),
    availableBalance:
      row.available_balance == null ? null : numberValue(row.available_balance),
    connected: Boolean(row.connected),
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    outOfDate: Boolean(row.out_of_date),
    inNetWorth: row.in_net_worth !== false,
  }));
  const monthly = rowsOf(dashboard?.monthly).map((row) => {
    const monthIncome = numberValue(row.income);
    const monthSpending = numberValue(row.spending);
    return {
      month: String(row.month),
      income: monthIncome,
      spending: monthSpending,
      net: monthIncome - monthSpending,
    };
  });
  const health: DataHealth = {
    hasConnections: numberValue(dashboard?.connected_accounts) > 0,
    importing: Boolean(dashboard?.importing),
    lastUpdatedAt,
    stale: isStale(lastUpdatedAt),
    attention: rowsOf(dashboard?.attention).map((row) => ({
      id: numberValue(row.id),
      institution: String(row.institution),
      message: String(row.message ?? ""),
      needsReconnect: Boolean(row.needs_reconnect),
      lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    })),
  };

  return {
    ...summarizeDashboard({
      today,
      now: Date.now(),
      accounts,
      cashOnHand,
      daily: rowsOf(dashboard?.daily).map((row) => ({
        date: String(row.date),
        merchant: String(row.merchant),
        value: numberValue(row.value),
      })),
      monthly,
      budgets: budgets.budgets,
      subscriptions: subscriptions.subscriptions,
      bills: subscriptions.bills,
      cardPayment: subscriptions.cardPayment,
      unusual: rowsOf(dashboard?.unusual).map((row) => ({
        id: numberValue(row.id),
        category: row.category ? String(row.category) : null,
        merchant: String(row.merchant),
        amount: numberValue(row.amount),
        typical: numberValue(row.typical),
        date: String(row.date),
      })),
      health,
    }),
    today,
    monthly,
    budgets: budgets.budgets,
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
      cashOnHand,
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
    accounts,
    recentTransactions: rowsOf(dashboard?.recent_transactions).map((row) => ({
      id: numberValue(row.id),
      date: String(row.date),
      transactionAt: row.transaction_at ? String(row.transaction_at) : null,
      name: String(row.name),
      merchantName: row.merchant_name ? String(row.merchant_name) : null,
      category: row.category ? String(row.category) : null,
      categoryDetailed: row.category_detailed
        ? String(row.category_detailed)
        : null,
      amount: numberValue(row.amount),
      accountName: String(row.account_name),
      pending: Boolean(row.pending),
      logoUrl: safePlaidLogoUrl(row.logo_url),
    })),
    health,
  };
}

export type StaleConnection = {
  institution: string;
  lastSuccessAt: string | null;
};

/** Connections that have stopped updating, so spending pages can say so. */
export async function getStaleConnections(): Promise<StaleConnection[]> {
  await requireSession();
  const rows = await getDb().execute(sql`
    select institution_name, last_success_at::text as last_success_at
    from public.plaid_items
    where status <> 'active'
    order by last_success_at
  `);
  return (rows as Row[]).map((row) => ({
    institution: String(row.institution_name),
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
  }));
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
          and a.source <> 'manual'
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
      select count(*)::int as count
      from public.accounts
      where connected = true and source <> 'manual'
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
