import "server-only";

import { type SQL, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import type { AccountRow, TrendPoint } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import {
  safeMerchantWebsite,
  safePlaidLogoUrl,
} from "@/lib/external-url";
import {
  COUNTS_AS_CASH_FLOW,
  INCOME_TOTAL,
  IS_INCOME,
  netWorthTrendCtes,
  SPENDING_TOTAL,
} from "@/lib/finance-sql";
import {
  deriveBills,
  deriveCardPayment,
  deriveSubscriptions,
  manualSubscriptionInsight,
  subscriptionStreamKey,
  type CardPaymentSchedule,
  type RecurringBill,
  type SubscriptionCadence,
  type SubscriptionCandidate,
  type SubscriptionInsight,
} from "@/lib/subscription-detection";
import {
  appTimeZone,
  monthStartInAppTimezone,
  subtractDays,
  todayInAppTimezone,
} from "@/lib/timezone";
import {
  DEFAULT_FILTERS,
  type Period,
  type TransactionFilters,
} from "@/lib/transaction-filters";

type Row = Record<string, unknown>;

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
}

export type TransactionRow = {
  id: number;
  externalId: string;
  date: string;
  authorizedDate: string | null;
  transactionAt: string | null;
  name: string;
  merchantName: string | null;
  originalDescription: string | null;
  category: string | null;
  categoryDetailed: string | null;
  amount: number;
  currencyCode: string;
  institutionName: string;
  accountName: string;
  accountOfficialName: string | null;
  accountMask: string | null;
  accountType: string;
  accountSubtype: string | null;
  accountSource: string;
  pending: boolean;
  paymentChannel: string | null;
  transactionCode: string | null;
  checkNumber: string | null;
  location: string | null;
  storeNumber: string | null;
  logoUrl: string | null;
  website: string | null;
  updatedAt: string;
  /** The owner left this out of income and spending. */
  ignored: boolean;
};

/** Enough for years of normal use, while keeping the page quick to load. */
const TRANSACTION_LIMIT = 750;

export type TransactionsData = {
  today: string;
  transactions: TransactionRow[];
  /** How many match, so the page can say when it shows only some. */
  totalCount: number;
  /**
   * True once there's more history than fits on the page. Filters then have to
   * run in the database, because the browser doesn't hold everything.
   */
  serverFiltered: boolean;
  categories: string[];
  accounts: string[];
  periodStarts: {
    mtd: string;
    last30Days: string;
    last90Days: string;
    ytd: string;
  };
  metrics: {
    income: number;
    spending: number;
    net: number;
    pending: number;
  };
};

function transactionConditions(
  filters: TransactionFilters,
  periodStarts: Record<Exclude<Period, "all">, string>,
): SQL[] {
  const conditions: SQL[] = [];
  if (filters.month) {
    conditions.push(sql`to_char(t.transaction_date, 'YYYY-MM') = ${filters.month}`);
  } else if (filters.period !== "all") {
    conditions.push(sql`t.transaction_date >= ${periodStarts[filters.period]}::date`);
  }
  if (filters.category !== "all") {
    conditions.push(sql`t.category_primary = ${filters.category}`);
  }
  if (filters.account !== "all") {
    conditions.push(sql`a.name = ${filters.account}`);
  }
  if (filters.status === "pending") conditions.push(sql`t.pending = true`);
  if (filters.status === "posted") conditions.push(sql`t.pending = false`);
  if (filters.q) {
    const pattern = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(sql`(
      t.merchant_name ilike ${pattern}
      or t.name ilike ${pattern}
      or a.name ilike ${pattern}
      or replace(t.category_primary, '_', ' ') ilike ${pattern}
      or replace(t.category_detailed, '_', ' ') ilike ${pattern}
      or to_char(abs(t.amount), 'FM999999990.00') ilike ${pattern}
    )`);
  }
  return conditions;
}

export async function getTransactionsData(
  filters: TransactionFilters = { ...DEFAULT_FILTERS, period: "all" },
  openId?: number,
): Promise<TransactionsData> {
  await requireSession();
  const db = getDb();
  const monthStart = monthStartInAppTimezone();
  const today = todayInAppTimezone();
  const timeZone = appTimeZone();
  const periodStarts = {
    mtd: monthStart,
    last30Days: subtractDays(today, 29),
    last90Days: subtractDays(today, 89),
    ytd: `${today.slice(0, 4)}-01-01`,
  };

  const [counted] = await db.execute(sql`
    select count(*)::int as total from public.transactions
  `);
  const serverFiltered = numberValue((counted as Row | undefined)?.total) > TRANSACTION_LIMIT;
  const conditions = serverFiltered ? transactionConditions(filters, periodStarts) : [];
  // A link straight to one transaction has to find it, wherever it falls.
  const scope = conditions.length
    ? sql`where (${sql.join(conditions, sql` and `)})${
        openId ? sql` or t.id = ${openId}` : sql``
      }`
    : sql``;

  const result = await db.execute(sql`
    with transaction_rows as (
      select
        t.id,
        t.external_id,
        t.transaction_date::text as date,
        t.authorized_date::text as authorized_date,
        t.transaction_at::text as transaction_at,
        t.name,
        t.merchant_name,
        t.raw_data->>'original_description' as original_description,
        t.category_primary as category,
        t.category_detailed,
        t.amount::float8 as amount,
        t.currency_code,
        t.pending,
        t.payment_channel,
        t.raw_data->>'transaction_code' as transaction_code,
        t.raw_data->>'check_number' as check_number,
        nullif(
          concat_ws(
            ', ',
            nullif(t.raw_data#>>'{location,address}', ''),
            nullif(
              concat_ws(
                ' ',
                nullif(t.raw_data#>>'{location,city}', ''),
                nullif(t.raw_data#>>'{location,region}', '')
              ),
              ''
            ),
            nullif(t.raw_data#>>'{location,postal_code}', ''),
            nullif(t.raw_data#>>'{location,country}', '')
          ),
          ''
        ) as location,
        t.raw_data#>>'{location,store_number}' as store_number,
        t.logo_url,
        t.website,
        t.ignored,
        t.updated_at::text as updated_at,
        a.institution_name,
        a.name as account_name,
        a.official_name as account_official_name,
        a.mask as account_mask,
        a.account_type,
        a.account_subtype,
        a.source::text as account_source,
        coalesce(
          t.transaction_at,
          t.transaction_date::timestamp at time zone ${timeZone}
        ) as sort_at
      from public.transactions t
      join public.accounts a on a.id = t.account_id
      ${scope}
      order by ${openId ? sql`(t.id = ${openId}) desc, ` : sql``}sort_at desc, t.id desc
      limit ${TRANSACTION_LIMIT}
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
    metric as (
      select
        ${INCOME_TOTAL} as income,
        ${SPENDING_TOTAL} as spending
      from public.transactions
      where transaction_date >= ${monthStart}::date
        and transaction_date < ${monthStart}::date + interval '1 month'
        and ${COUNTS_AS_CASH_FLOW}
    ),
    pending_total as (
      select coalesce(abs(sum(amount)), 0)::float8 as pending
      from public.transactions
      where pending = true
    ),
    total as (
      select count(*)::int as total_count
      from public.transactions t
      join public.accounts a on a.id = t.account_id
      ${scope}
    ),
    category_list as (
      select coalesce(
        jsonb_agg(distinct category_primary) filter (where category_primary is not null),
        '[]'::jsonb
      ) as data
      from public.transactions
    ),
    account_list as (
      select coalesce(jsonb_agg(distinct a.name), '[]'::jsonb) as data
      from public.accounts a
      where exists (select 1 from public.transactions t where t.account_id = a.id)
    )
    select
      transaction_data.data,
      metric.*,
      pending_total.*,
      total.*,
      category_list.data as category_list,
      account_list.data as account_list
    from transaction_data, metric, pending_total, total, category_list, account_list
  `);

  const row = result[0] as Row | undefined;
  const rawTransactions = Array.isArray(row?.data) ? (row.data as Row[]) : [];
  const transactions = rawTransactions.map((item) => ({
    id: numberValue(item.id),
    externalId: stringValue(item.external_id),
    date: stringValue(item.date),
    authorizedDate: item.authorized_date
      ? stringValue(item.authorized_date)
      : null,
    transactionAt: item.transaction_at
      ? stringValue(item.transaction_at)
      : null,
    name: stringValue(item.name),
    merchantName: item.merchant_name ? stringValue(item.merchant_name) : null,
    originalDescription: item.original_description
      ? stringValue(item.original_description)
      : null,
    category: item.category ? stringValue(item.category) : null,
    categoryDetailed: item.category_detailed
      ? stringValue(item.category_detailed)
      : null,
    amount: numberValue(item.amount),
    currencyCode: stringValue(item.currency_code),
    institutionName: stringValue(item.institution_name),
    accountName: stringValue(item.account_name),
    accountOfficialName: item.account_official_name
      ? stringValue(item.account_official_name)
      : null,
    accountMask: item.account_mask ? stringValue(item.account_mask) : null,
    accountType: stringValue(item.account_type),
    accountSubtype: item.account_subtype
      ? stringValue(item.account_subtype)
      : null,
    accountSource: stringValue(item.account_source),
    pending: Boolean(item.pending),
    paymentChannel: item.payment_channel
      ? stringValue(item.payment_channel)
      : null,
    transactionCode: item.transaction_code
      ? stringValue(item.transaction_code)
      : null,
    checkNumber: item.check_number ? stringValue(item.check_number) : null,
    location: item.location ? stringValue(item.location) : null,
    storeNumber: item.store_number ? stringValue(item.store_number) : null,
    logoUrl: safePlaidLogoUrl(item.logo_url),
    website: safeMerchantWebsite(item.website),
    updatedAt: stringValue(item.updated_at),
    ignored: Boolean(item.ignored),
  }));

  const income = numberValue(row?.income);
  const spending = numberValue(row?.spending);

  return {
    today,
    transactions,
    totalCount: numberValue(row?.total_count),
    serverFiltered,
    categories: (Array.isArray(row?.category_list) ? row.category_list : [])
      .map(stringValue)
      .sort(),
    accounts: (Array.isArray(row?.account_list) ? row.account_list : [])
      .map(stringValue)
      .sort(),
    periodStarts,
    metrics: {
      income,
      spending,
      net: income - spending,
      pending: numberValue(row?.pending),
    },
  };
}

export type AccountsData = {
  today: string;
  trend: TrendPoint[];
  accounts: AccountRow[];
  metrics: {
    netWorth: number;
    assets: number;
    liabilities: number;
    availableCash: number;
    connected: number;
  };
};

export async function getAccountsData(): Promise<AccountsData> {
  await requireSession();
  const db = getDb();
  const today = todayInAppTimezone();
  const trendQuery = db.execute(sql`
    with ${netWorthTrendCtes(today)}
    select trend.data from trend
  `);
  const historyQuery = db.execute(sql`
    select
      s.account_id,
      jsonb_agg(
        jsonb_build_object('date', s.snapshot_date::text, 'value', s.balance::float8)
        order by s.snapshot_date
      ) as history
    from public.balance_snapshots s
    join public.accounts a on a.id = s.account_id
    where a.connected = true
      and s.snapshot_date >= ${today}::date - 90
    group by s.account_id
  `);
  const accountsQuery = db.execute(sql`
    with account_rows as (
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
      order by institution_name, current_balance desc, name
    ),
    account_data as (
      select coalesce(
        jsonb_agg(to_jsonb(account_rows) order by institution_name, balance desc),
        '[]'::jsonb
      ) as data
      from account_rows
    ),
    account_metric as (
      select
        coalesce(sum(current_balance) filter (where current_balance >= 0), 0)::float8 as assets,
        coalesce(abs(sum(current_balance) filter (where current_balance < 0)), 0)::float8 as liabilities,
        coalesce(sum(coalesce(available_balance, current_balance)) filter (
          where account_type = 'depository'
        ), 0)::float8 as available_cash,
        count(*)::int as connected
      from public.accounts
      where connected = true
        and in_net_worth = true
    )
    select
      account_data.data,
      account_metric.*
    from account_data, account_metric
  `);
  const [result, trendResult, historyResult] = await Promise.all([
    accountsQuery,
    trendQuery,
    historyQuery,
  ]);

  const row = result[0] as Row | undefined;
  const accountRows = Array.isArray(row?.data) ? (row.data as Row[]) : [];
  const trendRows = (trendResult[0] as Row | undefined)?.data;
  const histories = new Map(
    (historyResult as Row[]).map((item) => [
      numberValue(item.account_id),
      (Array.isArray(item.history) ? (item.history as Row[]) : []).map(
        (point) => ({
          date: stringValue(point.date),
          value: numberValue(point.value),
        }),
      ),
    ]),
  );
  const monthAgo = subtractDays(today, 30);

  return {
    today,
    trend: (Array.isArray(trendRows) ? (trendRows as Row[]) : []).map((point) => ({
      date: stringValue(point.date),
      value: numberValue(point.value),
    })),
    accounts: accountRows.map((item) => {
      const history = histories.get(numberValue(item.id)) ?? [];
      const baseline = history.findLast((point) => point.date <= monthAgo);
      return {
      id: numberValue(item.id),
      institutionName: stringValue(item.institution_name),
      name: stringValue(item.name),
      type: stringValue(item.type),
      accountType: stringValue(item.account_type),
      mask: item.mask ? stringValue(item.mask) : null,
      source: stringValue(item.source),
      balance: numberValue(item.balance),
      availableBalance: item.available_balance == null
        ? null
        : numberValue(item.available_balance),
      connected: Boolean(item.connected),
      lastSyncedAt: item.last_synced_at
        ? stringValue(item.last_synced_at)
        : null,
      outOfDate: Boolean(item.out_of_date),
      inNetWorth: item.in_net_worth !== false,
      history,
      change30Days: baseline
        ? numberValue(item.balance) - baseline.value
        : null,
      };
    }),
    metrics: {
      netWorth: numberValue(row?.assets) - numberValue(row?.liabilities),
      assets: numberValue(row?.assets),
      liabilities: numberValue(row?.liabilities),
      availableCash: numberValue(row?.available_cash),
      connected: numberValue(row?.connected),
    },
  };
}

export type SubscriptionsData = {
  subscriptions: SubscriptionInsight[];
  /** Monthly must-pays like rent and utilities, which aren't subscriptions. */
  bills: RecurringBill[];
  cardPayment: CardPaymentSchedule | null;
  transactionChoices: {
    id: number;
    merchant: string;
    amount: number;
    occurredAt: string;
    category: string | null;
  }[];
  dismissed: {
    id: number;
    merchant: string;
    category: string | null;
  }[];
  metrics: {
    monthlyEstimate: number;
    annualEstimate: number;
    dueNext30Days: number;
    detected: number;
    billsMonthly: number;
    cardBalance: number;
  };
};

function cadenceValue(value: unknown): SubscriptionCadence | null {
  return ["weekly", "biweekly", "monthly", "quarterly", "annual"].includes(
    String(value),
  )
    ? (String(value) as SubscriptionCadence)
    : null;
}

export async function getSubscriptionsData(): Promise<SubscriptionsData> {
  await requireSession();
  const db = getDb();
  const candidateQuery = db.execute(sql`
    select
      coalesce(merchant_name, name) as merchant,
      name as description,
      category_primary as category,
      category_detailed,
      raw_data->>'transaction_code' as transaction_code,
      abs(amount)::float8 as amount,
      coalesce(
        transaction_at,
        transaction_date::timestamp at time zone ${appTimeZone()}
      )::text as occurred_at
    from public.transactions
    where amount < 0
      and pending = false
      and transaction_date >= current_date - interval '800 days'
      and ignored = false
      and coalesce(category_primary, '') not in (
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'BANK_FEES'
      )
    order by occurred_at
  `);
  const ruleQuery = db.execute(sql`
    select
      id,
      stream_key,
      rule_type,
      merchant_name,
      category_primary,
      cadence,
      amount::float8 as amount,
      last_charged_at
    from public.subscription_rules
    order by updated_at desc
  `);
  const transactionQuery = db.execute(sql`
    select
      id,
      coalesce(merchant_name, name) as merchant,
      name as description,
      category_primary as category,
      category_detailed,
      abs(amount)::float8 as amount,
      coalesce(
        transaction_at,
        transaction_date::timestamp at time zone ${appTimeZone()}
      )::text as occurred_at
    from public.transactions
    where amount < 0
      and pending = false
      and transaction_date >= current_date - interval '365 days'
      and coalesce(category_primary, '') not in (
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'INCOME',
        'LOAN_PAYMENTS'
      )
    order by occurred_at desc
    limit 200
  `);
  const cardQuery = db.execute(sql`
    select coalesce(abs(sum(current_balance)), 0)::float8 as owed
    from public.accounts
    where connected = true and in_net_worth = true and account_type = 'credit'
  `);
  const [candidateRows, ruleRows, transactionRows, cardRows] = await Promise.all([
    candidateQuery,
    ruleQuery,
    transactionQuery,
    cardQuery,
  ]);

  const candidates = (candidateRows as Row[]).map((item) => ({
    merchant: stringValue(item.merchant),
    description: stringValue(item.description),
    category: item.category ? stringValue(item.category) : null,
    categoryDetailed: item.category_detailed
      ? stringValue(item.category_detailed)
      : null,
    transactionCode: item.transaction_code
      ? stringValue(item.transaction_code)
      : null,
    amount: numberValue(item.amount),
    occurredAt: new Date(stringValue(item.occurred_at)),
  }));
  const ruleKeys = new Set(
    (ruleRows as Row[]).map((item) => stringValue(item.stream_key)),
  );
  const automatic = deriveSubscriptions(candidates).filter(
    (item) => !ruleKeys.has(item.streamKey),
  );
  const bills = deriveBills(candidates).filter(
    (item) => !ruleKeys.has(item.streamKey),
  );
  const manual = (ruleRows as Row[]).flatMap((item) => {
    const cadence = cadenceValue(item.cadence);
    const lastChargedAt = new Date(stringValue(item.last_charged_at));
    if (
      stringValue(item.rule_type) !== "included" ||
      !cadence ||
      !Number.isFinite(lastChargedAt.getTime())
    ) {
      return [];
    }
    return [
      manualSubscriptionInsight({
        ruleId: numberValue(item.id),
        streamKey: stringValue(item.stream_key),
        merchant: stringValue(item.merchant_name),
        category: item.category_primary
          ? stringValue(item.category_primary)
          : null,
        cadence,
        amount: numberValue(item.amount),
        lastChargedAt,
      }),
    ];
  });
  const subscriptions = [...automatic, ...manual].sort(
    (a, b) => b.monthlyEquivalent - a.monthlyEquivalent,
  );
  const dismissed = (ruleRows as Row[])
    .filter((item) => stringValue(item.rule_type) === "excluded")
    .map((item) => ({
      id: numberValue(item.id),
      merchant: stringValue(item.merchant_name),
      category: item.category_primary
        ? stringValue(item.category_primary)
        : null,
    }));

  const seenTransactionStreams = new Set<string>();
  const transactionChoices = (transactionRows as Row[]).flatMap((item) => {
    const candidate: SubscriptionCandidate = {
      merchant: stringValue(item.merchant),
      description: stringValue(item.description),
      category: item.category ? stringValue(item.category) : null,
      categoryDetailed: item.category_detailed
        ? stringValue(item.category_detailed)
        : null,
      transactionCode: null,
      amount: numberValue(item.amount),
      occurredAt: new Date(stringValue(item.occurred_at)),
    };
    const streamKey = subscriptionStreamKey(candidate);
    if (seenTransactionStreams.has(streamKey) || streamKey.startsWith(":")) {
      return [];
    }
    seenTransactionStreams.add(streamKey);
    return [
      {
        id: numberValue(item.id),
        merchant: candidate.merchant,
        amount: candidate.amount,
        occurredAt: candidate.occurredAt.toISOString(),
        category: candidate.category,
      },
    ];
  });
  const now = Date.now();
  const next30Days = now + 30 * 86_400_000;
  const monthlyEstimate = subscriptions.reduce(
    (sum, item) => sum + item.monthlyEquivalent,
    0,
  );

  return {
    subscriptions,
    bills,
    cardPayment: deriveCardPayment(candidates),
    transactionChoices,
    dismissed,
    metrics: {
      billsMonthly: bills.reduce((sum, item) => sum + item.amount, 0),
      cardBalance: numberValue((cardRows[0] as Row | undefined)?.owed),
      monthlyEstimate,
      annualEstimate: subscriptions.reduce(
        (sum, item) => sum + item.annualized,
        0,
      ),
      dueNext30Days: subscriptions
        .filter((item) => {
          const expected = Date.parse(item.nextExpectedAt);
          return expected >= now && expected <= next30Days;
        })
        .reduce((sum, item) => sum + item.averageAmount, 0),
      detected: subscriptions.length,
    },
  };
}

export type InvestmentAccountSummary = {
  id: number;
  name: string;
  officialName: string | null;
  institutionName: string;
  mask: string | null;
  value: number;
  /** Null when the brokerage doesn't share what was paid. */
  costBasis: number | null;
  gain: number | null;
  gainPercent: number | null;
};

export type HoldingSummary = {
  symbol: string;
  name: string;
  assetType: string;
  quantity: number;
  price: number | null;
  value: number;
  costBasis: number | null;
  gain: number | null;
  gainPercent: number | null;
  /** Share of everything held, as a percentage. */
  share: number;
};

export type InvestmentsData = {
  accounts: InvestmentAccountSummary[];
  holdings: HoldingSummary[];
  allocation: { type: string; value: number; percent: number }[];
  /** Oldest first. `value` is the gain or loss; `marketValue` what it was worth. */
  history: { date: string; value: number; marketValue: number }[];
  metrics: {
    value: number;
    costBasis: number | null;
    gain: number | null;
    gainPercent: number | null;
    accounts: number;
    /** True when some holdings have no cost basis, so gain is a partial figure. */
    gainIsPartial: boolean;
  };
};

function percentOf(part: number | null, whole: number | null): number | null {
  return part === null || !whole ? null : (part / whole) * 100;
}

export async function getInvestmentsData(): Promise<InvestmentsData> {
  await requireSession();
  const db = getDb();
  const today = todayInAppTimezone();
  const [accountsResult, holdingsResult, historyResult] = await Promise.all([
    db.execute(sql`
      select
        a.id,
        a.name,
        a.official_name,
        a.institution_name,
        a.mask,
        a.current_balance::float8 as value,
        sum(h.cost_basis)::float8 as cost_basis,
        sum(h.unrealized_gain)::float8 as gain
      from public.accounts a
      left join public.holdings h on h.account_id = a.id
      where a.connected = true
        and a.account_type = 'investment'
      group by a.id
      order by a.current_balance desc, a.name
    `),
    db.execute(sql`
      select
        h.symbol,
        max(h.name) as name,
        max(h.asset_type) as asset_type,
        sum(h.quantity)::float8 as quantity,
        max(h.current_price)::float8 as price,
        sum(h.current_value)::float8 as value,
        case when count(h.cost_basis) = count(*)
          then sum(h.cost_basis)::float8
        end as cost_basis,
        case when count(h.unrealized_gain) = count(*)
          then sum(h.unrealized_gain)::float8
        end as gain
      from public.holdings h
      join public.accounts a on a.id = h.account_id
      where a.connected = true
      group by h.symbol
      order by value desc
    `),
    db.execute(sql`
      select
        snapshots.snapshot_date::text as date,
        sum(snapshots.unrealized_gain)::float8 as value,
        sum(snapshots.market_value)::float8 as market_value
      from public.investment_snapshots snapshots
      join public.accounts a on a.id = snapshots.account_id
      where snapshots.snapshot_date >= ${today}::date - 365
        and a.connected = true
      group by snapshots.snapshot_date
      order by snapshots.snapshot_date
    `),
  ]);

  const nullableNumber = (value: unknown) =>
    value == null ? null : numberValue(value);

  const accounts = (accountsResult as Row[]).map((item) => {
    const costBasis = nullableNumber(item.cost_basis);
    const gain = nullableNumber(item.gain);
    return {
      id: numberValue(item.id),
      name: stringValue(item.name),
      officialName: item.official_name
        ? stringValue(item.official_name)
        : null,
      institutionName: stringValue(item.institution_name),
      mask: item.mask ? stringValue(item.mask) : null,
      value: numberValue(item.value),
      costBasis,
      gain,
      gainPercent: percentOf(gain, costBasis),
    };
  });

  const holdingRows = holdingsResult as Row[];
  const holdingsTotal = holdingRows.reduce(
    (sum, item) => sum + numberValue(item.value),
    0,
  );
  const holdings = holdingRows.map((item) => {
    const value = numberValue(item.value);
    const costBasis = nullableNumber(item.cost_basis);
    const gain = nullableNumber(item.gain);
    return {
      symbol: stringValue(item.symbol),
      name: stringValue(item.name),
      assetType: stringValue(item.asset_type),
      quantity: numberValue(item.quantity),
      price: nullableNumber(item.price),
      value,
      costBasis,
      gain,
      gainPercent: percentOf(gain, costBasis),
      share: holdingsTotal ? (value / holdingsTotal) * 100 : 0,
    };
  });

  const byType = new Map<string, number>();
  for (const holding of holdings) {
    byType.set(
      holding.assetType,
      (byType.get(holding.assetType) ?? 0) + holding.value,
    );
  }
  const allocation = Array.from(byType, ([type, value]) => ({
    type,
    value,
    percent: holdingsTotal ? (value / holdingsTotal) * 100 : 0,
  })).sort((a, b) => b.value - a.value);

  const value = accounts.reduce((sum, account) => sum + account.value, 0);
  const known = accounts.filter((account) => account.costBasis !== null);
  const costBasis = known.length
    ? known.reduce((sum, account) => sum + (account.costBasis ?? 0), 0)
    : null;
  const gain = known.length
    ? known.reduce((sum, account) => sum + (account.gain ?? 0), 0)
    : null;

  return {
    accounts,
    holdings,
    allocation,
    history: (historyResult as Row[]).map((item) => ({
      date: stringValue(item.date),
      value: numberValue(item.value),
      marketValue: numberValue(item.market_value),
    })),
    metrics: {
      value,
      costBasis,
      gain,
      gainPercent: percentOf(gain, costBasis),
      accounts: accounts.length,
      gainIsPartial:
        known.length < accounts.length ||
        // Cash has no gain to report, so it can't leave anything out.
        holdings.some(
          (holding) => holding.costBasis === null && holding.assetType !== "cash",
        ),
    },
  };
}

export type BudgetRow = {
  category: string;
  spent: number;
  monthlyLimit: number | null;
  remaining: number | null;
  percent: number | null;
  /** What a recent month has run, for suggesting a realistic budget. */
  usual: number | null;
  /** Charges waiting to post, which aren't in `spent` yet. */
  pending: number;
};

export type BudgetsData = {
  today: string;
  budgets: BudgetRow[];
  metrics: {
    planned: number;
    spent: number;
    remaining: number;
    categoriesSet: number;
  };
};

export async function getBudgetsData(): Promise<BudgetsData> {
  await requireSession();
  const db = getDb();
  const monthStart = monthStartInAppTimezone();
  const result = await db.execute(sql`
    with category_spend as (
      select
        coalesce(category_primary, 'OTHER') as category,
        greatest(sum(-amount), 0)::float8 as spent
      from public.transactions
      where transaction_date >= ${monthStart}::date
        and transaction_date < ${monthStart}::date + interval '1 month'
        and ${COUNTS_AS_CASH_FLOW}
        and not ${IS_INCOME}
      group by coalesce(category_primary, 'OTHER')
    ),
    recent as (
      select
        coalesce(category_primary, 'OTHER') as category,
        date_trunc('month', transaction_date)::date as month,
        sum(-amount) as spent
      from public.transactions
      where transaction_date >= ${monthStart}::date - interval '3 months'
        and transaction_date < ${monthStart}::date
        and ${COUNTS_AS_CASH_FLOW}
        and not ${IS_INCOME}
      group by 1, 2
    ),
    -- Divides by the months with any history, not always three, so a new
    -- account's first month isn't watered down.
    recent_months as (
      select greatest(count(distinct month), 1)::float8 as months from recent
    ),
    category_usual as (
      select
        category,
        greatest(sum(spent), 0)::float8 / (select months from recent_months) as usual
      from recent
      group by category
    ),
    category_pending as (
      select
        coalesce(category_primary, 'OTHER') as category,
        greatest(sum(-amount), 0)::float8 as pending
      from public.transactions
      where transaction_date >= ${monthStart}::date
        and pending = true
        and ignored = false
        and amount < 0
        and coalesce(category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT')
        and coalesce(category_detailed, '') <> 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
      group by 1
    ),
    categories as (
      select category from category_spend
      union
      select category from category_usual
      union
      select category from category_pending
      union
      select category_primary as category from public.budgets
    )
    select
      categories.category,
      coalesce(category_spend.spent, 0)::float8 as spent,
      budgets.monthly_limit::float8 as monthly_limit,
      category_usual.usual,
      coalesce(category_pending.pending, 0)::float8 as pending
    from categories
    left join category_spend using (category)
    left join category_usual using (category)
    left join category_pending using (category)
    left join public.budgets on budgets.category_primary = categories.category
    order by
      budgets.monthly_limit is null,
      coalesce(category_spend.spent, 0) desc,
      categories.category
  `);

  const budgets = (result as Row[]).map((item) => {
    const spent = numberValue(item.spent);
    const monthlyLimit =
      item.monthly_limit == null ? null : numberValue(item.monthly_limit);
    return {
      category: stringValue(item.category),
      spent,
      monthlyLimit,
      remaining: monthlyLimit == null ? null : monthlyLimit - spent,
      percent:
        monthlyLimit == null ? null : (spent / monthlyLimit) * 100,
      usual: item.usual == null ? null : numberValue(item.usual),
      pending: numberValue(item.pending),
    };
  });
  const planned = budgets.reduce(
    (sum, item) => sum + (item.monthlyLimit ?? 0),
    0,
  );
  const spentOnBudgeted = budgets.reduce(
    (sum, item) => sum + (item.monthlyLimit == null ? 0 : item.spent),
    0,
  );

  return {
    today: todayInAppTimezone(),
    budgets,
    metrics: {
      planned,
      spent: spentOnBudgeted,
      remaining: planned - spentOnBudgeted,
      categoriesSet: budgets.filter((item) => item.monthlyLimit != null).length,
    },
  };
}

export type SpendingCategory = {
  category: string;
  value: number;
  previous: number;
  /** A typical recent month for this category, when there's history. */
  usual: number | null;
  /** The six months ending with the selected one, oldest first. */
  history: number[];
  details: { detail: string | null; value: number; count: number }[];
  merchants: { merchant: string; value: number; count: number }[];
};

export type SpendingData = {
  today: string;
  selectedMonth: string;
  availableMonths: string[];
  monthly: {
    month: string;
    income: number;
    spending: number;
    net: number;
  }[];
  categories: SpendingCategory[];
  /** Monthly limits by category, for comparing any month against its budget. */
  limits: Record<string, number>;
  topMerchants: { merchant: string; value: number; count: number }[];
  incomeSources: { source: string; value: number; count: number }[];
  largest: {
    id: number;
    merchant: string;
    value: number;
    date: string;
    category: string | null;
    categoryDetailed: string | null;
  }[];
  metrics: {
    income: number;
    spending: number;
    net: number;
    topCategory: { category: string; value: number } | null;
    /** Share of income kept, as a percentage. Null with no income that month. */
    savingsRate: number | null;
    /** Typical spending across the earlier months that have any. */
    averageSpending: number | null;
  };
};

function spendingMonthStart(value?: string): string {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "")
    ? `${value}-01`
    : monthStartInAppTimezone();
}

export async function getSpendingData(
  requestedMonth?: string,
): Promise<SpendingData> {
  await requireSession();
  const db = getDb();
  const currentMonth = monthStartInAppTimezone();
  const requestedMonthStart = spendingMonthStart(requestedMonth);
  const limitsQuery = db.execute(sql`
    select category_primary as category, monthly_limit::float8 as monthly_limit
    from public.budgets
  `);
  const resultQuery = db.execute(sql`
    with bounds as (
      select least(
        coalesce(date_trunc('month', min(transaction_date))::date, ${currentMonth}::date),
        ${currentMonth}::date
      ) as first_month
      from public.transactions
    ),
    selection as (
      select least(
        ${currentMonth}::date,
        greatest(first_month, ${requestedMonthStart}::date)
      ) as month
      from bounds
    ),
    -- The chart stays on the latest months while any of them is picked, so
    -- choosing a month doesn't slide the whole chart out from under the pointer.
    chart_window as (
      select case
        when selection.month >= ${currentMonth}::date - interval '11 months'
          then ${currentMonth}::date
        else selection.month
      end as last_month
      from selection
    ),
    months as (
      select generate_series(
        chart_window.last_month - interval '16 months',
        chart_window.last_month,
        interval '1 month'
      )::date as month
      from chart_window
    ),
    monthly_rows as (
      select
        date_trunc('month', transaction_date)::date as month,
        ${INCOME_TOTAL} as income,
        ${SPENDING_TOTAL} as spending
      from public.transactions, chart_window
      where transaction_date >= chart_window.last_month - interval '16 months'
        and transaction_date < chart_window.last_month + interval '1 month'
        and ${COUNTS_AS_CASH_FLOW}
      group by date_trunc('month', transaction_date)::date
    ),
    monthly_data as (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'month', months.month::text,
          'income', coalesce(monthly_rows.income, 0),
          'spending', coalesce(monthly_rows.spending, 0)
        ) order by months.month),
        '[]'::jsonb
      ) as data
      from months
      left join monthly_rows using (month)
    ),
    available_month_rows as (
      select generate_series(
        bounds.first_month,
        ${currentMonth}::date,
        interval '1 month'
      )::date as month
      from bounds
    ),
    available_month_data as (
      select coalesce(
        jsonb_agg(month::text order by month desc),
        '[]'::jsonb
      ) as data
      from available_month_rows
    ),
    category_months as (
      select
        coalesce(category_primary, 'OTHER') as category,
        date_trunc('month', transaction_date)::date as month,
        sum(-amount)::float8 as value
      from public.transactions, selection
      where transaction_date >= selection.month - interval '5 months'
        and transaction_date < selection.month + interval '1 month'
        and ${COUNTS_AS_CASH_FLOW}
        and not ${IS_INCOME}
      group by 1, 2
    ),
    category_rows as (
      select
        category_months.category,
        coalesce(sum(category_months.value) filter (
          where category_months.month = selection.month
        ), 0)::float8 as value,
        jsonb_object_agg(category_months.month::text, category_months.value) as history
      from category_months, selection
      group by category_months.category, selection.month
      having coalesce(sum(category_months.value) filter (
        where category_months.month = selection.month
      ), 0) > 0
      order by value desc
      limit 12
    ),
    category_data as (
      select coalesce(
        jsonb_agg(to_jsonb(category_rows) order by value desc),
        '[]'::jsonb
      ) as data
      from category_rows
    ),
    detail_rows as (
      select
        coalesce(category_primary, 'OTHER') as category,
        category_detailed as detail,
        sum(-amount)::float8 as value,
        count(*)::int as count
      from public.transactions, selection
      where transaction_date >= selection.month
        and transaction_date < selection.month + interval '1 month'
        and ${COUNTS_AS_CASH_FLOW}
        and not ${IS_INCOME}
      group by 1, 2
      having sum(-amount) > 0
    ),
    detail_data as (
      select coalesce(
        jsonb_agg(to_jsonb(detail_rows) order by value desc),
        '[]'::jsonb
      ) as data
      from detail_rows
    ),
    category_merchant_rows as (
      select category, merchant, value, count
      from (
        select
          coalesce(category_primary, 'OTHER') as category,
          coalesce(merchant_name, name) as merchant,
          sum(-amount)::float8 as value,
          count(*)::int as count,
          row_number() over (
            partition by coalesce(category_primary, 'OTHER')
            order by sum(-amount) desc
          ) as merchant_rank
        from public.transactions, selection
        where transaction_date >= selection.month
          and transaction_date < selection.month + interval '1 month'
          and ${COUNTS_AS_CASH_FLOW}
          and not ${IS_INCOME}
        group by 1, 2
        having sum(-amount) > 0
      ) ranked
      where merchant_rank <= 4
    ),
    category_merchant_data as (
      select coalesce(
        jsonb_agg(to_jsonb(category_merchant_rows) order by value desc),
        '[]'::jsonb
      ) as data
      from category_merchant_rows
    ),
    income_rows as (
      select
        coalesce(merchant_name, name) as source,
        sum(amount)::float8 as value,
        count(*)::int as count
      from public.transactions, selection
      where transaction_date >= selection.month
        and transaction_date < selection.month + interval '1 month'
        and ${COUNTS_AS_CASH_FLOW}
        and ${IS_INCOME}
      group by coalesce(merchant_name, name)
      order by value desc
      limit 5
    ),
    income_data as (
      select coalesce(
        jsonb_agg(to_jsonb(income_rows) order by value desc),
        '[]'::jsonb
      ) as data
      from income_rows
    ),
    largest_rows as (
      select
        id,
        coalesce(merchant_name, name) as merchant,
        (-amount)::float8 as value,
        transaction_date::text as date,
        category_primary as category,
        category_detailed
      from public.transactions, selection
      where transaction_date >= selection.month
        and transaction_date < selection.month + interval '1 month'
        and amount < 0
        and ${COUNTS_AS_CASH_FLOW}
      order by amount
      limit 5
    ),
    largest_data as (
      select coalesce(
        jsonb_agg(to_jsonb(largest_rows) order by value desc),
        '[]'::jsonb
      ) as data
      from largest_rows
    ),
    merchant_rows as (
      select
        coalesce(merchant_name, name) as merchant,
        sum(-amount)::float8 as value,
        count(*)::int as count
      from public.transactions, selection
      where transaction_date >= selection.month
        and transaction_date < selection.month + interval '1 month'
        and ${COUNTS_AS_CASH_FLOW}
        and not ${IS_INCOME}
      group by coalesce(merchant_name, name)
      having sum(-amount) > 0
      order by value desc
      limit 8
    ),
    merchant_data as (
      select coalesce(
        jsonb_agg(to_jsonb(merchant_rows) order by value desc),
        '[]'::jsonb
      ) as data
      from merchant_rows
    )
    select
      monthly_data.data as monthly,
      category_data.data as categories,
      detail_data.data as details,
      category_merchant_data.data as category_merchants,
      merchant_data.data as top_merchants,
      income_data.data as income_sources,
      largest_data.data as largest,
      available_month_data.data as available_months,
      selection.month::text as selected_month
    from monthly_data, category_data, detail_data, category_merchant_data,
      merchant_data, income_data, largest_data, available_month_data, selection
  `);
  const [result, limitRows] = await Promise.all([resultQuery, limitsQuery]);

  const row = result[0] as Row | undefined;
  const monthly = (Array.isArray(row?.monthly) ? (row.monthly as Row[]) : []).map(
    (item) => {
      const income = numberValue(item.income);
      const spending = numberValue(item.spending);
      return {
        month: stringValue(item.month),
        income,
        spending,
        net: income - spending,
      };
    },
  );
  const rowsOf = (value: unknown) => (Array.isArray(value) ? (value as Row[]) : []);
  const selectedMonth = stringValue(row?.selected_month);
  const selectedIndex = monthly.findIndex((item) => item.month === selectedMonth);
  const historyMonths = monthly
    .slice(Math.max(selectedIndex - 5, 0), selectedIndex + 1)
    .map((item) => item.month);
  const earlierMonths = monthly
    .slice(Math.max(selectedIndex - 3, 0), Math.max(selectedIndex, 0))
    .filter((item) => item.spending > 0);
  // Only months the owner has data for count toward what's usual.
  const comparisonMonths = earlierMonths.map((item) => item.month);
  const details = rowsOf(row?.details);
  const categoryMerchants = rowsOf(row?.category_merchants);
  const categories = rowsOf(row?.categories).map((item) => {
    const category = stringValue(item.category);
    const history = (item.history ?? {}) as Record<string, unknown>;
    const spentIn = (month: string) => Math.max(numberValue(history[month]), 0);
    return {
      category,
      value: numberValue(item.value),
      previous: spentIn(historyMonths.at(-2) ?? ""),
      usual: comparisonMonths.length
        ? comparisonMonths.reduce((sum, month) => sum + spentIn(month), 0) /
          comparisonMonths.length
        : null,
      history: historyMonths.map(spentIn),
      details: details
        .filter((detail) => stringValue(detail.category) === category)
        .map((detail) => ({
          detail: detail.detail ? stringValue(detail.detail) : null,
          value: numberValue(detail.value),
          count: numberValue(detail.count),
        })),
      merchants: categoryMerchants
        .filter((merchant) => stringValue(merchant.category) === category)
        .map((merchant) => ({
          merchant: stringValue(merchant.merchant),
          value: numberValue(merchant.value),
          count: numberValue(merchant.count),
        })),
    };
  });
  const topMerchants = (
    Array.isArray(row?.top_merchants) ? (row.top_merchants as Row[]) : []
  ).map((item) => ({
    merchant: stringValue(item.merchant),
    value: numberValue(item.value),
    count: numberValue(item.count),
  }));
  const selectedMetrics = monthly[selectedIndex];

  return {
    today: todayInAppTimezone(),
    selectedMonth,
    availableMonths: (
      Array.isArray(row?.available_months)
        ? (row.available_months as unknown[])
        : []
    ).map(stringValue),
    monthly,
    categories,
    limits: Object.fromEntries(
      (limitRows as Row[]).map((item) => [
        stringValue(item.category),
        numberValue(item.monthly_limit),
      ]),
    ),
    topMerchants,
    incomeSources: rowsOf(row?.income_sources).map((item) => ({
      source: stringValue(item.source),
      value: numberValue(item.value),
      count: numberValue(item.count),
    })),
    largest: rowsOf(row?.largest).map((item) => ({
      id: numberValue(item.id),
      merchant: stringValue(item.merchant),
      value: numberValue(item.value),
      date: stringValue(item.date),
      category: item.category ? stringValue(item.category) : null,
      categoryDetailed: item.category_detailed
        ? stringValue(item.category_detailed)
        : null,
    })),
    metrics: {
      income: selectedMetrics?.income ?? 0,
      spending: selectedMetrics?.spending ?? 0,
      net: selectedMetrics?.net ?? 0,
      topCategory: categories.at(0) ?? null,
      savingsRate: selectedMetrics?.income
        ? (selectedMetrics.net / selectedMetrics.income) * 100
        : null,
      averageSpending: earlierMonths.length
        ? earlierMonths.reduce((sum, month) => sum + month.spending, 0) /
          earlierMonths.length
        : null,
    },
  };
}
