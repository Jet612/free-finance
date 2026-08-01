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
  deriveSubscriptions,
  manualSubscriptionInsight,
  subscriptionStreamKey,
  type SubscriptionCadence,
  type SubscriptionCandidate,
  type SubscriptionInsight,
} from "@/lib/subscription-detection";

type Row = Record<string, unknown>;

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown): string {
  return value == null ? "" : String(value);
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

export type TransactionsData = {
  transactions: TransactionRow[];
  categories: string[];
  accounts: string[];
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
  const timeZone = process.env.APP_TIMEZONE ?? "America/New_York";

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
      limit 750
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
        coalesce(sum(amount) filter (
          where amount > 0 and pending = false
        ), 0)::float8 as income,
        coalesce(abs(sum(amount) filter (
          where amount < 0 and pending = false
        )), 0)::float8 as spending,
        coalesce(sum(amount) filter (where pending = false), 0)::float8 as net,
        coalesce(abs(sum(amount) filter (where pending = true)), 0)::float8 as pending
      from public.transactions
      where transaction_date >= ${monthStart}::date
        and coalesce(category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT')
    )
    select transaction_data.data, metric.*
    from transaction_data, metric
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

  return {
    transactions,
    categories: Array.from(
      new Set(transactions.map((item) => item.category).filter(Boolean)),
    ).sort() as string[],
    accounts: Array.from(
      new Set(transactions.map((item) => item.accountName)),
    ).sort(),
    metrics: {
      income: numberValue(row?.income),
      spending: numberValue(row?.spending),
      net: numberValue(row?.net),
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
        mask,
        source::text,
        current_balance::float8 as balance,
        available_balance::float8 as available_balance,
        connected,
        last_synced_at::text
      from public.accounts
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
        coalesce(sum(available_balance) filter (
          where account_type in ('depository', 'cash')
        ), 0)::float8 as available_cash,
        count(*) filter (where connected)::int as connected
      from public.accounts
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
  const candidateRows = await db.execute(sql`
    select
      coalesce(merchant_name, name) as merchant,
      name as description,
      category_primary as category,
      category_detailed,
      raw_data->>'transaction_code' as transaction_code,
      abs(amount)::float8 as amount,
      coalesce(
        transaction_at,
        transaction_date::timestamp at time zone ${process.env.APP_TIMEZONE ?? "America/New_York"}
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
  const ruleRows = await db.execute(sql`
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
  const transactionRows = await db.execute(sql`
    select
      id,
      coalesce(merchant_name, name) as merchant,
      name as description,
      category_primary as category,
      category_detailed,
      abs(amount)::float8 as amount,
      coalesce(
        transaction_at,
        transaction_date::timestamp at time zone ${process.env.APP_TIMEZONE ?? "America/New_York"}
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

export type HoldingRow = {
  id: number;
  symbol: string;
  name: string;
  assetType: string;
  quantity: number;
  averageCost: number | null;
  currentPrice: number | null;
  currentValue: number;
  costBasis: number | null;
  unrealizedGain: number | null;
  unrealizedGainPercent: number | null;
  accountName: string;
  syncedAt: string;
};

export type InvestmentsData = {
  holdings: HoldingRow[];
  allocation: { type: string; value: number; percent: number }[];
  history: { date: string; value: number }[];
  metrics: {
    value: number;
    investedValue: number;
    cashBalance: number;
    costBasis: number;
    gain: number;
    gainPercent: number | null;
    positions: number;
  };
};

export async function getInvestmentsData(): Promise<InvestmentsData> {
  await requireSession();
  const db = getDb();
  const [holdingsResult, historyResult, portfolioResult] = await Promise.all([
    db.execute(sql`
      select
        h.id,
        h.symbol,
        h.name,
        h.asset_type,
        h.quantity::float8 as quantity,
        h.average_cost::float8 as average_cost,
        h.current_price::float8 as current_price,
        h.current_value::float8 as current_value,
        h.cost_basis::float8 as cost_basis,
        h.unrealized_gain::float8 as unrealized_gain,
        h.unrealized_gain_percent::float8 as unrealized_gain_percent,
        h.synced_at::text,
        a.name as account_name
      from public.holdings h
      join public.accounts a on a.id = h.account_id
      order by h.current_value desc, h.symbol
    `),
    db.execute(sql`
      select
        bs.snapshot_date::text as date,
        sum(bs.balance)::float8 as value
      from public.balance_snapshots bs
      join public.accounts a on a.id = bs.account_id
      where bs.snapshot_date >= current_date - interval '365 days'
        and a.connected = true
        and (a.account_type = 'investment' or a.source = 'robinhood')
      group by bs.snapshot_date
      order by bs.snapshot_date
    `),
    db.execute(sql`
      select coalesce(sum(current_balance), 0)::float8 as value
      from public.accounts
      where connected = true
        and (account_type = 'investment' or source = 'robinhood')
    `),
  ]);
  const holdings = (holdingsResult as Row[]).map((item) => ({
    id: numberValue(item.id),
    symbol: stringValue(item.symbol),
    name: stringValue(item.name),
    assetType: stringValue(item.asset_type),
    quantity: numberValue(item.quantity),
    averageCost:
      item.average_cost == null ? null : numberValue(item.average_cost),
    currentPrice:
      item.current_price == null ? null : numberValue(item.current_price),
    currentValue: numberValue(item.current_value),
    costBasis: item.cost_basis == null ? null : numberValue(item.cost_basis),
    unrealizedGain:
      item.unrealized_gain == null ? null : numberValue(item.unrealized_gain),
    unrealizedGainPercent:
      item.unrealized_gain_percent == null
        ? null
        : numberValue(item.unrealized_gain_percent),
    accountName: stringValue(item.account_name),
    syncedAt: stringValue(item.synced_at),
  }));
  const investedValue = holdings.reduce(
    (sum, item) => sum + item.currentValue,
    0,
  );
  const portfolioValue = numberValue((portfolioResult as Row[])[0]?.value);
  const costBasis = holdings.reduce(
    (sum, item) => sum + (item.costBasis ?? 0),
    0,
  );
  const allocationMap = new Map<string, number>();
  for (const holding of holdings) {
    allocationMap.set(
      holding.assetType,
      (allocationMap.get(holding.assetType) ?? 0) + holding.currentValue,
    );
  }

  return {
    holdings,
    history: (historyResult as Row[]).map((item) => ({
      date: stringValue(item.date),
      value: numberValue(item.value),
    })),
    allocation: Array.from(allocationMap, ([type, allocationValue]) => ({
      type,
      value: allocationValue,
      percent: investedValue ? (allocationValue / investedValue) * 100 : 0,
    })).sort((a, b) => b.value - a.value),
    metrics: {
      value: portfolioValue,
      investedValue,
      cashBalance: portfolioValue - investedValue,
      costBasis,
      gain: investedValue - costBasis,
      gainPercent: costBasis
        ? ((investedValue - costBasis) / costBasis) * 100
        : null,
      positions: holdings.length,
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
        abs(sum(amount))::float8 as spent
      from public.transactions
      where transaction_date >= ${monthStart}::date
        and amount < 0
        and pending = false
        and coalesce(category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT')
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

export type ReportsData = {
  monthly: {
    month: string;
    income: number;
    spending: number;
    net: number;
  }[];
  categories: { category: string; value: number }[];
  metrics: {
    averageIncome: number;
    averageSpending: number;
    averageNet: number;
    savingsRate: number | null;
  };
};

export async function getReportsData(): Promise<ReportsData> {
  await requireSession();
  const db = getDb();
  const result = await db.execute(sql`
    with months as (
      select generate_series(
        date_trunc('month', current_date) - interval '5 months',
        date_trunc('month', current_date),
        interval '1 month'
      )::date as month
    ),
    monthly_rows as (
      select
        date_trunc('month', transaction_date)::date as month,
        coalesce(sum(amount) filter (where amount > 0), 0)::float8 as income,
        coalesce(abs(sum(amount) filter (where amount < 0)), 0)::float8 as spending,
        coalesce(sum(amount), 0)::float8 as net
      from public.transactions
      where transaction_date >= date_trunc('month', current_date) - interval '5 months'
        and pending = false
        and coalesce(category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT')
      group by date_trunc('month', transaction_date)::date
    ),
    monthly_data as (
      select coalesce(
        jsonb_agg(jsonb_build_object(
          'month', months.month::text,
          'income', coalesce(monthly_rows.income, 0),
          'spending', coalesce(monthly_rows.spending, 0),
          'net', coalesce(monthly_rows.net, 0)
        ) order by months.month),
        '[]'::jsonb
      ) as data
      from months
      left join monthly_rows using (month)
    ),
    category_rows as (
      select
        coalesce(category_primary, 'OTHER') as category,
        abs(sum(amount))::float8 as value
      from public.transactions
      where transaction_date >= current_date - interval '90 days'
        and amount < 0
        and pending = false
        and coalesce(category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT')
      group by coalesce(category_primary, 'OTHER')
      order by value desc
      limit 10
    ),
    category_data as (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('category', category, 'value', value)
          order by value desc
        ),
        '[]'::jsonb
      ) as data
      from category_rows
    )
    select monthly_data.data as monthly, category_data.data as categories
    from monthly_data, category_data
  `);

  const row = result[0] as Row | undefined;
  const monthly = (Array.isArray(row?.monthly) ? (row.monthly as Row[]) : []).map(
    (item) => ({
      month: stringValue(item.month),
      income: numberValue(item.income),
      spending: numberValue(item.spending),
      net: numberValue(item.net),
    }),
  );
  const divisor = monthly.length || 1;
  const totalIncome = monthly.reduce((sum, item) => sum + item.income, 0);
  const totalSpending = monthly.reduce((sum, item) => sum + item.spending, 0);

  return {
    monthly,
    categories: (
      Array.isArray(row?.categories) ? (row.categories as Row[]) : []
    ).map((item) => ({
      category: stringValue(item.category),
      value: numberValue(item.value),
    })),
    metrics: {
      averageIncome: totalIncome / divisor,
      averageSpending: totalSpending / divisor,
      averageNet: (totalIncome - totalSpending) / divisor,
      savingsRate: totalIncome
        ? ((totalIncome - totalSpending) / totalIncome) * 100
        : null,
    },
  };
}
