import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import type { AccountRow } from "@/lib/data";
import { requireSession } from "@/lib/auth";
import {
  safeMerchantWebsite,
  safePlaidLogoUrl,
} from "@/lib/external-url";
import {
  COUNTS_AS_CASH_FLOW,
  INCOME_TOTAL,
  IS_INCOME,
  SPENDING_TOTAL,
} from "@/lib/finance-sql";
import {
  deriveSubscriptions,
  manualSubscriptionInsight,
  subscriptionStreamKey,
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
};

/** Enough for years of normal use, while keeping the page quick to load. */
const TRANSACTION_LIMIT = 750;

export type TransactionsData = {
  transactions: TransactionRow[];
  /** How many exist in all, so the page can say when it shows only some. */
  totalCount: number;
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

export async function getTransactionsData(): Promise<TransactionsData> {
  await requireSession();
  const db = getDb();
  const monthStart = monthStartInAppTimezone();
  const today = todayInAppTimezone();
  const timeZone = appTimeZone();

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
      order by sort_at desc, t.id desc
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
      select count(*)::int as total_count from public.transactions
    )
    select transaction_data.data, metric.*, pending_total.*, total.*
    from transaction_data, metric, pending_total, total
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
  }));

  const income = numberValue(row?.income);
  const spending = numberValue(row?.spending);

  return {
    transactions,
    totalCount: numberValue(row?.total_count),
    categories: Array.from(
      new Set(transactions.map((item) => item.category).filter(Boolean)),
    ).sort() as string[],
    accounts: Array.from(
      new Set(transactions.map((item) => item.accountName)),
    ).sort(),
    periodStarts: {
      mtd: monthStart,
      last30Days: subtractDays(today, 29),
      last90Days: subtractDays(today, 89),
      ytd: `${today.slice(0, 4)}-01-01`,
    },
    metrics: {
      income,
      spending,
      net: income - spending,
      pending: numberValue(row?.pending),
    },
  };
}

export type AccountsData = {
  accounts: AccountRow[];
  metrics: {
    assets: number;
    liabilities: number;
    availableCash: number;
    connected: number;
  };
};

export async function getAccountsData(): Promise<AccountsData> {
  await requireSession();
  const db = getDb();
  const result = await db.execute(sql`
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
        last_synced_at::text
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
    )
    select
      account_data.data,
      account_metric.*
    from account_data, account_metric
  `);

  const row = result[0] as Row | undefined;
  const accountRows = Array.isArray(row?.data) ? (row.data as Row[]) : [];
  return {
    accounts: accountRows.map((item) => ({
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
    })),
    metrics: {
      assets: numberValue(row?.assets),
      liabilities: numberValue(row?.liabilities),
      availableCash: numberValue(row?.available_cash),
      connected: numberValue(row?.connected),
    },
  };
}

export type SubscriptionsData = {
  subscriptions: SubscriptionInsight[];
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
      and coalesce(category_primary, '') not in (
        'TRANSFER_IN',
        'TRANSFER_OUT',
        'LOAN_PAYMENTS',
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
  const [candidateRows, ruleRows, transactionRows] = await Promise.all([
    candidateQuery,
    ruleQuery,
    transactionQuery,
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
    transactionChoices,
    dismissed,
    metrics: {
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
  history: { date: string; value: number }[];
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
        sum(snapshots.unrealized_gain)::float8 as value
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
    })),
    metrics: {
      value,
      costBasis,
      gain,
      gainPercent: percentOf(gain, costBasis),
      accounts: accounts.length,
      gainIsPartial:
        known.length < accounts.length ||
        holdings.some((holding) => holding.costBasis === null),
    },
  };
}

export type BudgetRow = {
  category: string;
  spent: number;
  monthlyLimit: number | null;
  remaining: number | null;
  percent: number | null;
};

export type BudgetsData = {
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
    categories as (
      select category from category_spend
      union
      select category_primary as category from public.budgets
    )
    select
      categories.category,
      coalesce(category_spend.spent, 0)::float8 as spent,
      budgets.monthly_limit::float8 as monthly_limit
    from categories
    left join category_spend using (category)
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
    budgets,
    metrics: {
      planned,
      spent: spentOnBudgeted,
      remaining: planned - spentOnBudgeted,
      categoriesSet: budgets.filter((item) => item.monthlyLimit != null).length,
    },
  };
}

export type SpendingData = {
  selectedMonth: string;
  availableMonths: string[];
  monthly: {
    month: string;
    income: number;
    spending: number;
    net: number;
  }[];
  categories: { category: string; value: number; previous: number }[];
  topMerchants: { merchant: string; value: number; count: number }[];
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
  const result = await db.execute(sql`
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
    months as (
      select generate_series(
        selection.month - interval '5 months',
        selection.month,
        interval '1 month'
      )::date as month
      from selection
    ),
    monthly_rows as (
      select
        date_trunc('month', transaction_date)::date as month,
        ${INCOME_TOTAL} as income,
        ${SPENDING_TOTAL} as spending
      from public.transactions, selection
      where transaction_date >= selection.month - interval '5 months'
        and transaction_date < selection.month + interval '1 month'
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
    category_totals as (
      select
        coalesce(category_primary, 'OTHER') as category,
        coalesce(sum(-amount) filter (
          where transaction_date >= selection.month
        ), 0)::float8 as value,
        coalesce(sum(-amount) filter (
          where transaction_date < selection.month
        ), 0)::float8 as previous
      from public.transactions, selection
      where transaction_date >= selection.month - interval '1 month'
        and transaction_date < selection.month + interval '1 month'
        and ${COUNTS_AS_CASH_FLOW}
        and not ${IS_INCOME}
      group by coalesce(category_primary, 'OTHER')
    ),
    category_rows as (
      select category, value, greatest(previous, 0) as previous
      from category_totals
      where value > 0
      order by value desc
      limit 10
    ),
    category_data as (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'category', category,
            'value', value,
            'previous', previous
          )
          order by value desc
        ),
        '[]'::jsonb
      ) as data
      from category_rows
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
      merchant_data.data as top_merchants,
      available_month_data.data as available_months,
      selection.month::text as selected_month
    from monthly_data, category_data, merchant_data, available_month_data,
      selection
  `);

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
  const categories = (
    Array.isArray(row?.categories) ? (row.categories as Row[]) : []
  ).map((item) => ({
    category: stringValue(item.category),
    value: numberValue(item.value),
    previous: numberValue(item.previous),
  }));
  const topMerchants = (
    Array.isArray(row?.top_merchants) ? (row.top_merchants as Row[]) : []
  ).map((item) => ({
    merchant: stringValue(item.merchant),
    value: numberValue(item.value),
    count: numberValue(item.count),
  }));
  const selectedMetrics = monthly.at(-1);
  const earlierMonths = monthly
    .slice(0, -1)
    .filter((month) => month.spending > 0);

  return {
    selectedMonth: stringValue(row?.selected_month),
    availableMonths: (
      Array.isArray(row?.available_months)
        ? (row.available_months as unknown[])
        : []
    ).map(stringValue),
    monthly,
    categories,
    topMerchants,
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
