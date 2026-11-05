/**
 * The demo's data, generated from one made-up ledger dated relative to today. It
 * goes through the same summary code as a real account, so every page agrees with
 * every other page and the demo never looks out of date.
 */
import { summarizeDashboard } from "@/lib/dashboard-summary";
import type {
  AccountRow,
  ConnectionsData,
  DashboardData,
  RecentTransaction,
  StaleConnection,
  TrendPoint,
} from "@/lib/data";
import type {
  AccountsData,
  BudgetRow,
  BudgetsData,
  InvestmentsData,
  SpendingData,
  SubscriptionsData,
  TransactionRow,
  TransactionsData,
} from "@/lib/detail-data";
import { daysInMonth, type DailySpend, type MonthlyFlow, type UnusualCharge } from "@/lib/insights";
import {
  deriveBills,
  deriveCardPayment,
  deriveSubscriptions,
  type SubscriptionCandidate,
} from "@/lib/subscription-detection";
import { subtractDays, todayInAppTimezone } from "@/lib/timezone";
import { countsAsCashFlow as isCashFlow, isIncome } from "@/lib/transaction-filters";

const HISTORY_MONTHS = 13;
/** How long the demo's broken connection has been out of date. */
const BROKEN_DAYS = 6;

type AccountKey = "checking" | "savings" | "card";

const ACCOUNTS: Record<AccountKey, Pick<TransactionRow, "institutionName" | "accountName" | "accountOfficialName" | "accountMask" | "accountType" | "accountSubtype">> = {
  checking: {
    institutionName: "Mercury Community",
    accountName: "Everyday checking",
    accountOfficialName: "Everyday Checking",
    accountMask: "2481",
    accountType: "depository",
    accountSubtype: "checking",
  },
  savings: {
    institutionName: "Clearwater Bank",
    accountName: "High-yield savings",
    accountOfficialName: "High-Yield Savings",
    accountMask: "6012",
    accountType: "depository",
    accountSubtype: "savings",
  },
  card: {
    institutionName: "Summit Credit",
    accountName: "Rewards card",
    accountOfficialName: "Rewards Credit Card",
    accountMask: "7730",
    accountType: "credit",
    accountSubtype: "credit card",
  },
};

const BALANCES: Record<AccountKey, { balance: number; available: number }> = {
  checking: { balance: 8632.44, available: 8421.18 },
  savings: { balance: 20648.72, available: 20648.72 },
  card: { balance: -1260.38, available: 8739.62 },
};

const INVESTMENT_ACCOUNTS = [
  { id: 4, name: "Individual brokerage", official: "Individual Investing", mask: "9824", type: "brokerage", balance: 42180.16, costBasis: 37192.4 },
  { id: 5, name: "Roth IRA", official: "Roth IRA", mask: "1809", type: "ira", balance: 22183.06, costBasis: 19958.64 },
];

const HOLDINGS = [
  { symbol: "VTI", name: "Total Stock Market ETF", assetType: "etf", quantity: 98.4, price: 301.2, value: 29638.08, costBasis: 24900 },
  { symbol: "VXUS", name: "Total International Stock ETF", assetType: "etf", quantity: 180, price: 66.1, value: 11898, costBasis: 10800 },
  { symbol: "BND", name: "Total Bond Market ETF", assetType: "etf", quantity: 110, price: 74.4, value: 8184, costBasis: 8250 },
  { symbol: "AAPL", name: "Apple Inc.", assetType: "equity", quantity: 30, price: 219.2, value: 6576, costBasis: 5400 },
  { symbol: "MSFT", name: "Microsoft Corp.", assetType: "equity", quantity: 12, price: 412.5, value: 4950, costBasis: 4683.9 },
  { symbol: "USD", name: "Cash", assetType: "cash", quantity: 3117.14, price: 1, value: 3117.14, costBasis: 3117.14 },
];

const BUDGET_LIMITS: Record<string, number> = {
  FOOD_AND_DRINK: 900,
  TRANSPORTATION: 300,
  GENERAL_MERCHANDISE: 350,
  ENTERTAINMENT: 120,
  PERSONAL_CARE: 150,
};

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + by, 1)).toISOString().slice(0, 7);
}

function dayOf(month: string, day: number): string {
  return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, "0")}`;
}

type Spend = {
  merchant: string;
  name: string;
  category: string;
  detail: string;
  low: number;
  high: number;
  perMonth: number;
  channel?: string;
};

const EVERYDAY: Spend[] = [
  { merchant: "Whole Foods Market", name: "WHOLE FOODS 10234", category: "FOOD_AND_DRINK", detail: "FOOD_AND_DRINK_GROCERIES", low: 46, high: 118, perMonth: 4 },
  { merchant: "Trader Joe's", name: "TRADER JOE'S 552", category: "FOOD_AND_DRINK", detail: "FOOD_AND_DRINK_GROCERIES", low: 32, high: 84, perMonth: 3 },
  { merchant: "Northstar Coffee", name: "NORTHSTAR COFFEE", category: "FOOD_AND_DRINK", detail: "FOOD_AND_DRINK_COFFEE", low: 4.75, high: 8.5, perMonth: 8 },
  { merchant: "Bluebird Diner", name: "BLUEBIRD DINER", category: "FOOD_AND_DRINK", detail: "FOOD_AND_DRINK_RESTAURANT", low: 18, high: 62, perMonth: 4 },
  { merchant: "Thai Orchid", name: "THAI ORCHID", category: "FOOD_AND_DRINK", detail: "FOOD_AND_DRINK_RESTAURANT", low: 16, high: 44, perMonth: 2 },
  { merchant: "Shell", name: "SHELL OIL 44192", category: "TRANSPORTATION", detail: "TRANSPORTATION_GAS", low: 38, high: 58, perMonth: 3 },
  { merchant: "Uber", name: "UBER TRIP", category: "TRANSPORTATION", detail: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES", low: 11, high: 34, perMonth: 3, channel: "online" },
  { merchant: "Target", name: "TARGET 1842", category: "GENERAL_MERCHANDISE", detail: "GENERAL_MERCHANDISE_SUPERSTORES", low: 22, high: 96, perMonth: 2 },
  { merchant: "Amazon", name: "AMZN MKTP US", category: "GENERAL_MERCHANDISE", detail: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", low: 14, high: 72, perMonth: 3, channel: "online" },
  { merchant: "REI", name: "REI 184", category: "GENERAL_MERCHANDISE", detail: "GENERAL_MERCHANDISE_SPORTING_GOODS", low: 28, high: 74, perMonth: 1 },
  { merchant: "Luna Salon", name: "LUNA SALON", category: "PERSONAL_CARE", detail: "PERSONAL_CARE_HAIR_AND_BEAUTY", low: 48, high: 72, perMonth: 1 },
];

type Ledger = {
  today: string;
  /** Newest first. */
  transactions: TransactionRow[];
  subscriptions: ReturnType<typeof deriveSubscriptions>;
  bills: ReturnType<typeof deriveBills>;
  cardPayment: ReturnType<typeof deriveCardPayment>;
};

let cached: Ledger | undefined;

function buildLedger(today: string): Ledger {
  const rows: Omit<TransactionRow, "id" | "externalId">[] = [];
  const currentMonth = today.slice(0, 7);
  const roll = random(Number(currentMonth.replace("-", "")));

  // The card's feed is broken, so nothing newer than that can have reached it.
  const cardFeedEnds = subtractDays(today, BROKEN_DAYS);

  function add(
    date: string,
    merchant: string,
    name: string,
    amount: number,
    category: string,
    detail: string,
    requestedAccount: AccountKey,
    extra: Partial<TransactionRow> = {},
  ) {
    if (date > today) return;
    const account =
      requestedAccount === "card" && date > cardFeedEnds ? "checking" : requestedAccount;
    rows.push({
      date,
      authorizedDate: date,
      transactionAt: null,
      name,
      merchantName: merchant,
      originalDescription: null,
      category,
      categoryDetailed: detail,
      amount: round(amount),
      currencyCode: "USD",
      ...ACCOUNTS[account],
      accountSource: "plaid",
      pending: false,
      paymentChannel: account === "card" ? "in store" : "other",
      transactionCode: null,
      checkNumber: null,
      location: null,
      storeNumber: null,
      logoUrl: null,
      website: null,
      updatedAt: `${today}T07:00:00Z`,
      ignored: false,
      ...extra,
    });
  }

  for (let back = HISTORY_MONTHS; back >= 0; back -= 1) {
    const month = shiftMonth(currentMonth, -back);
    const netflix = back <= 1 ? 17.99 : 15.49;

    add(dayOf(month, 1), "Acme Payroll", "ACME PAYROLL DIRECT DEP", 2425, "INCOME", "INCOME_WAGES", "checking");
    add(dayOf(month, 15), "Acme Payroll", "ACME PAYROLL DIRECT DEP", 2425, "INCOME", "INCOME_WAGES", "checking");
    add(dayOf(month, 1), "Cedar Property Co.", "CEDAR PROPERTY CO", -1780, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT", "checking", { paymentChannel: "online" });
    add(dayOf(month, 2), "Transfer to savings", "TRANSFER TO SAVINGS", -500, "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS", "checking");
    add(dayOf(month, 2), "Transfer from checking", "TRANSFER FROM CHECKING", 500, "TRANSFER_IN", "TRANSFER_IN_SAVINGS", "savings");
    add(dayOf(month, 6), "Fiberlink", "FIBERLINK INTERNET", -65, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_INTERNET_AND_CABLE", "card", { paymentChannel: "online" });
    add(dayOf(month, 12), "City Power & Light", "CITY POWER", -(72 + roll() * 52), "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY", "checking", { paymentChannel: "online" });
    add(dayOf(month, 14), "Harbor Fitness", "HARBOR FITNESS MEMBERSHIP", -59, "PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", "card", { paymentChannel: "online" });
    add(dayOf(month, 18), "Tidewater Mobile", "TIDEWATER MOBILE", -45, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE", "card", { paymentChannel: "online" });
    add(dayOf(month, 20), "Netflix", "NETFLIX.COM", -netflix, "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES", "card", { paymentChannel: "online" });
    add(dayOf(month, 28), "Spotify", "SPOTIFY USA", -11.99, "ENTERTAINMENT", "ENTERTAINMENT_MUSIC_AND_AUDIO", "card", { paymentChannel: "online" });

    const payment = 1020 + roll() * 240;
    add(dayOf(month, 25), "Summit Credit payment", "SUMMIT CREDIT PAYMENT", -payment, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", "checking");
    add(dayOf(month, 25), "Payment received", "PAYMENT THANK YOU", payment, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", "card");
    add(dayOf(month, 31), "Treasury interest", "TREASURY INTEREST", 62 + roll() * 22, "INCOME", "INCOME_INTEREST_EARNED", "savings");

    for (const spend of EVERYDAY) {
      const times = Math.max(0, Math.round(spend.perMonth + (roll() - 0.5) * 2));
      for (let index = 0; index < times; index += 1) {
        const day = 1 + Math.floor(roll() * daysInMonth(month));
        add(
          dayOf(month, day),
          spend.merchant,
          spend.name,
          -(spend.low + roll() * (spend.high - spend.low)),
          spend.category,
          spend.detail,
          "card",
          { paymentChannel: spend.channel ?? "in store" },
        );
      }
    }

    if (back % 4 === 2) {
      add(dayOf(month, 9), "Morningside Dental", "MORNINGSIDE DENTAL", -140, "MEDICAL", "MEDICAL_DENTAL_CARE", "checking");
    }
    if (back === 3) {
      add(dayOf(month, 17), "Delta Air Lines", "DELTA AIR LINES", -312.4, "TRAVEL", "TRAVEL_FLIGHTS", "card", { paymentChannel: "online" });
      add(dayOf(month, 21), "Harborview Hotel", "HARBORVIEW HOTEL", -486.75, "TRAVEL", "TRAVEL_LODGING", "card");
    }
  }

  // A charge well above normal, and a few that haven't posted yet.
  add(subtractDays(today, 2), "REI", "REI 184", -386.2, "GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SPORTING_GOODS", "card");
  add(today, "Northstar Coffee", "NORTHSTAR COFFEE", -6.75, "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", "card", { pending: true });
  add(today, "Shell", "SHELL OIL 44192", -44.18, "TRANSPORTATION", "TRANSPORTATION_GAS", "card", { pending: true });
  // An annual renewal needs two years of history to be recognized.
  add(subtractDays(today, 150), "Cloud Storage", "CLOUD STORAGE ANNUAL", -99.99, "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", "card", { paymentChannel: "online" });
  add(subtractDays(today, 515), "Cloud Storage", "CLOUD STORAGE ANNUAL", -99.99, "GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", "card", { paymentChannel: "online" });

  rows.sort((a, b) => a.date.localeCompare(b.date));
  const transactions = rows
    .map((row, index) => ({ ...row, id: index + 1, externalId: `demo-${index + 1}` }))
    .reverse();

  const candidates: SubscriptionCandidate[] = transactions
    .filter((item) => item.amount < 0 && !item.pending)
    .filter((item) => !["TRANSFER_IN", "TRANSFER_OUT", "BANK_FEES"].includes(item.category ?? ""))
    .map((item) => ({
      merchant: item.merchantName ?? item.name,
      description: item.name,
      category: item.category,
      categoryDetailed: item.categoryDetailed,
      transactionCode: null,
      amount: Math.abs(item.amount),
      occurredAt: new Date(`${item.date}T12:00:00Z`),
    }));

  return {
    today,
    transactions,
    subscriptions: deriveSubscriptions(candidates),
    bills: deriveBills(candidates),
    cardPayment: deriveCardPayment(candidates),
  };
}

function ledger(): Ledger {
  const today = todayInAppTimezone();
  if (cached?.today !== today) cached = buildLedger(today);
  return cached;
}


function inMonth(item: TransactionRow, month: string): boolean {
  return item.date.startsWith(month);
}

function monthFlow(transactions: TransactionRow[], month: string): MonthlyFlow {
  const rows = transactions.filter((item) => inMonth(item, month) && isCashFlow(item));
  const income = rows.filter(isIncome).reduce((sum, item) => sum + item.amount, 0);
  const spending = Math.max(
    -rows.filter((item) => !isIncome(item)).reduce((sum, item) => sum + item.amount, 0),
    0,
  );
  return { month: `${month}-01`, income, spending, net: income - spending };
}

function monthlyFlows(transactions: TransactionRow[], through: string, months: number): MonthlyFlow[] {
  return Array.from({ length: months }, (_, index) =>
    monthFlow(transactions, shiftMonth(through, index - months + 1)),
  );
}

function wobble(daysAgo: number, seed: number): number {
  return (
    Math.sin(daysAgo / 17 + seed) * 320 +
    Math.sin(daysAgo / 5.3 + seed * 2) * 120 +
    Math.sin(daysAgo / 41 + seed * 3) * 540
  );
}

function netWorthTrend(today: string, current: number): TrendPoint[] {
  return Array.from({ length: 366 }, (_, index) => {
    const daysAgo = 365 - index;
    // A market dip around five months ago, so the line isn't a straight climb.
    const dip = -2100 * Math.exp(-(((daysAgo - 150) / 22) ** 2));
    const value = current - daysAgo * 43 + (daysAgo ? wobble(daysAgo, 1) - wobble(0, 1) * Math.exp(-daysAgo / 8) + dip : 0);
    return { date: subtractDays(today, daysAgo), value: round(value) };
  });
}

function accountRows(): AccountRow[] {
  const { today, transactions } = ledger();
  const lastSyncedAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const brokenSince = new Date(Date.now() - BROKEN_DAYS * 86_400_000).toISOString();
  const banked = (["checking", "savings", "card"] as const).map((key, index) => {
    const meta = ACCOUNTS[key];
    const { balance, available } = BALANCES[key];
    const history = Array.from({ length: 91 }, (_, offset) => {
      const date = subtractDays(today, 90 - offset);
      const since = transactions
        .filter((item) => item.accountName === meta.accountName && !item.pending && item.date > date)
        .reduce((sum, item) => sum + item.amount, 0);
      return { date, value: round(balance - since) };
    });
    return {
      id: index + 1,
      institutionName: meta.institutionName,
      name: meta.accountName,
      type: meta.accountSubtype ?? "",
      accountType: meta.accountType,
      mask: meta.accountMask,
      source: "plaid",
      balance,
      availableBalance: available,
      connected: true,
      lastSyncedAt: key === "card" ? brokenSince : lastSyncedAt,
      outOfDate: key === "card",
      inNetWorth: true,
      history,
      change30Days: round(balance - history[60].value),
    };
  });
  const invested = INVESTMENT_ACCOUNTS.map((item) => {
    const history = Array.from({ length: 91 }, (_, offset) => {
      const daysAgo = 90 - offset;
      const scale = item.balance / 64363;
      return {
        date: subtractDays(today, daysAgo),
        value: round(item.balance + scale * (-daysAgo * 22 + (daysAgo ? wobble(daysAgo, 2) : 0))),
      };
    });
    return {
      id: item.id,
      institutionName: "Northstar Investing",
      name: item.name,
      type: item.type,
      accountType: "investment",
      mask: item.mask,
      source: "plaid",
      balance: item.balance,
      availableBalance: null,
      connected: true,
      lastSyncedAt,
      inNetWorth: true,
      history,
      change30Days: round(item.balance - history[60].value),
    };
  });
  return [...banked, ...invested].sort((a, b) => b.balance - a.balance);
}

function netWorth(accounts: AccountRow[]): number {
  return round(accounts.reduce((sum, item) => sum + item.balance, 0));
}

function budgetRows(): BudgetRow[] {
  const { today, transactions } = ledger();
  const month = today.slice(0, 7);
  const spend = (months: string[]) => {
    const totals = new Map<string, number>();
    for (const item of transactions) {
      if (!isCashFlow(item) || isIncome(item)) continue;
      if (!months.some((value) => inMonth(item, value))) continue;
      const category = item.category ?? "OTHER";
      totals.set(category, (totals.get(category) ?? 0) - item.amount);
    }
    return totals;
  };
  const current = spend([month]);
  const recent = spend([1, 2, 3].map((back) => shiftMonth(month, -back)));
  const pendingByCategory = new Map<string, number>();
  for (const item of transactions) {
    if (!item.pending || item.amount >= 0 || !inMonth(item, month)) continue;
    const category = item.category ?? "OTHER";
    pendingByCategory.set(category, (pendingByCategory.get(category) ?? 0) - item.amount);
  }
  const categories = new Set([
    ...current.keys(),
    ...recent.keys(),
    ...pendingByCategory.keys(),
    ...Object.keys(BUDGET_LIMITS),
  ]);

  return [...categories]
    .map((category) => {
      const spent = Math.max(current.get(category) ?? 0, 0);
      const monthlyLimit = BUDGET_LIMITS[category] ?? null;
      return {
        category,
        spent,
        monthlyLimit,
        remaining: monthlyLimit === null ? null : monthlyLimit - spent,
        percent: monthlyLimit === null ? null : (spent / monthlyLimit) * 100,
        usual: recent.has(category) ? Math.max(recent.get(category) ?? 0, 0) / 3 : null,
        pending: pendingByCategory.get(category) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        Number(a.monthlyLimit === null) - Number(b.monthlyLimit === null) ||
        b.spent - a.spent,
    );
}

function unusualCharges(): UnusualCharge[] {
  const { today, transactions } = ledger();
  const weekAgo = subtractDays(today, 6);
  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return transactions.flatMap((item) => {
    if (item.date < weekAgo || item.amount >= 0 || !isCashFlow(item)) return [];
    const past = transactions
      .filter(
        (other) =>
          other.merchantName === item.merchantName &&
          other.id !== item.id &&
          other.amount < 0 &&
          !other.pending &&
          other.date < item.date &&
          other.date >= subtractDays(item.date, 180),
      )
      .map((other) => -other.amount);
    if (past.length < 3) return [];
    const typical = median(past);
    if (-item.amount < Math.max(50, typical * 2.5)) return [];
    return [
      {
        id: item.id,
        category: item.category,
        merchant: item.merchantName ?? item.name,
        amount: -item.amount,
        typical,
        date: item.date,
      },
    ];
  });
}

function summitAttention() {
  return {
    id: 4,
    institution: "Summit Credit",
    message: "Summit Credit needs you to sign in again. Choose Reconnect to fix it.",
    needsReconnect: true,
    lastSuccessAt: new Date(Date.now() - BROKEN_DAYS * 86_400_000).toISOString(),
  };
}

export function getMockStaleConnections(): StaleConnection[] {
  const { institution, lastSuccessAt } = summitAttention();
  return [{ institution, lastSuccessAt }];
}

export function getMockDashboardData(): DashboardData {
  const { today, transactions, subscriptions, bills, cardPayment } = ledger();
  const accounts = accountRows();
  const month = today.slice(0, 7);
  const monthly = monthlyFlows(transactions, month, 7);
  const current = monthly.at(-1)!;
  const budgets = budgetRows();
  const worth = netWorth(accounts);
  const trend = netWorthTrend(today, worth);
  const cashOnHand = accounts
    .filter((item) => item.accountType === "depository")
    .reduce((sum, item) => sum + (item.availableBalance ?? item.balance), 0);
  const baseline = trend.find((point) => point.date >= subtractDays(today, 90));
  const change = baseline ? worth - baseline.value : null;
  const dailySpend: DailySpend[] = transactions
    .filter((item) => isCashFlow(item) && !isIncome(item))
    .filter((item) => item.date >= `${shiftMonth(month, -3)}-01`)
    .map((item) => ({
      date: item.date,
      merchant: item.merchantName ?? item.name,
      value: -item.amount,
    }));
  const health = {
    hasConnections: true,
    importing: false,
    lastUpdatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    stale: false,
    attention: [summitAttention()],
  };
  const lastMonthPoint = dayOf(shiftMonth(month, -1), Number(today.slice(8, 10)));
  const spentByThisPoint = -transactions
    .filter(
      (item) =>
        inMonth(item, shiftMonth(month, -1)) &&
        item.date <= lastMonthPoint &&
        isCashFlow(item) &&
        !isIncome(item),
    )
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    ...summarizeDashboard({
      today,
      now: Date.now(),
      accounts,
      cashOnHand,
      daily: dailySpend,
      monthly,
      budgets,
      subscriptions,
      bills,
      cardPayment,
      unusual: unusualCharges(),
      health,
    }),
    today,
    monthly,
    budgets,
    metrics: {
      netWorth: worth,
      netWorthChange: change,
      netWorthChangePercent:
        change !== null && baseline ? (change / Math.abs(baseline.value)) * 100 : null,
      netWorthChangeSince: baseline?.date ?? null,
      monthlyCashFlow: current.net,
      monthlyIncome: current.income,
      monthlySpending: current.spending,
      investmentValue: accounts
        .filter((item) => item.accountType === "investment")
        .reduce((sum, item) => sum + item.balance, 0),
      cashOnHand,
      moneyOwed: Math.abs(BALANCES.card.balance),
      spentByThisPointLastMonth: Math.max(spentByThisPoint, 0),
    },
    trend,
    spending: [],
    accounts,
    recentTransactions: transactions
      .filter(
        (item) =>
          !["TRANSFER_IN", "TRANSFER_OUT"].includes(item.category ?? "") &&
          item.categoryDetailed !== "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      )
      .slice(0, 8)
      .map(
      (item): RecentTransaction => ({
        id: item.id,
        date: item.date,
        transactionAt: item.transactionAt,
        name: item.name,
        merchantName: item.merchantName,
        category: item.category,
        categoryDetailed: item.categoryDetailed,
        amount: item.amount,
        accountName: item.accountName,
        pending: item.pending,
        logoUrl: item.logoUrl,
      }),
    ),
    health,
  };
}

export function getMockTransactionsData(): TransactionsData {
  const { today, transactions } = ledger();
  const month = today.slice(0, 7);
  const flow = monthFlow(transactions, month);
  return {
    today,
    transactions,
    totalCount: transactions.length,
    serverFiltered: false,
    categories: [...new Set(transactions.map((item) => item.category).filter(Boolean))].sort() as string[],
    accounts: [...new Set(transactions.map((item) => item.accountName))].sort(),
    periodStarts: {
      mtd: `${month}-01`,
      last30Days: subtractDays(today, 29),
      last90Days: subtractDays(today, 89),
      ytd: `${today.slice(0, 4)}-01-01`,
    },
    metrics: {
      income: flow.income,
      spending: flow.spending,
      net: flow.net,
      pending: Math.abs(
        transactions.filter((item) => item.pending).reduce((sum, item) => sum + item.amount, 0),
      ),
    },
  };
}

export function getMockAccountsData(): AccountsData {
  const { today } = ledger();
  const accounts = accountRows();
  const worth = netWorth(accounts);
  const positive = accounts.filter((item) => item.balance >= 0);
  const negative = accounts.filter((item) => item.balance < 0);
  return {
    today,
    trend: netWorthTrend(today, worth),
    accounts,
    metrics: {
      netWorth: worth,
      assets: positive.reduce((sum, item) => sum + item.balance, 0),
      liabilities: Math.abs(negative.reduce((sum, item) => sum + item.balance, 0)),
      availableCash: accounts
        .filter((item) => item.accountType === "depository")
        .reduce((sum, item) => sum + (item.availableBalance ?? item.balance), 0),
      connected: accounts.length,
    },
  };
}

export function getMockInvestmentsData(): InvestmentsData {
  const { today } = ledger();
  const total = HOLDINGS.reduce((sum, item) => sum + item.value, 0);
  const byType = new Map<string, number>();
  for (const item of HOLDINGS) {
    byType.set(item.assetType, (byType.get(item.assetType) ?? 0) + item.value);
  }
  const costBasis = INVESTMENT_ACCOUNTS.reduce((sum, item) => sum + item.costBasis, 0);
  const value = INVESTMENT_ACCOUNTS.reduce((sum, item) => sum + item.balance, 0);
  const gain = value - costBasis;

  return {
    accounts: INVESTMENT_ACCOUNTS.map((item) => ({
      id: item.id,
      name: item.name,
      officialName: item.official,
      institutionName: "Northstar Investing",
      mask: item.mask,
      value: item.balance,
      costBasis: item.costBasis,
      gain: item.balance - item.costBasis,
      gainPercent: ((item.balance - item.costBasis) / item.costBasis) * 100,
    })),
    holdings: HOLDINGS.map((item) => ({
      ...item,
      gain: item.value - item.costBasis,
      gainPercent: ((item.value - item.costBasis) / item.costBasis) * 100,
      share: (item.value / total) * 100,
    })),
    allocation: [...byType]
      .map(([type, amount]) => ({ type, value: amount, percent: (amount / total) * 100 }))
      .sort((a, b) => b.value - a.value),
    history: Array.from({ length: 366 }, (_, index) => {
      const daysAgo = 365 - index;
      const dip = -1700 * Math.exp(-(((daysAgo - 150) / 22) ** 2));
      const marketValue = value - daysAgo * 24 + (daysAgo ? wobble(daysAgo, 2) * 0.8 + dip : 0);
      return {
        date: subtractDays(today, daysAgo),
        marketValue: round(marketValue),
        value: round(marketValue - (costBasis - daysAgo * 11)),
      };
    }),
    metrics: {
      value,
      costBasis,
      gain,
      gainPercent: (gain / costBasis) * 100,
      accounts: INVESTMENT_ACCOUNTS.length,
      gainIsPartial: false,
    },
  };
}

export function getMockBudgetsData(): BudgetsData {
  const budgets = budgetRows();
  const set = budgets.filter((item) => item.monthlyLimit !== null);
  const planned = set.reduce((sum, item) => sum + (item.monthlyLimit ?? 0), 0);
  const spent = set.reduce((sum, item) => sum + item.spent, 0);
  return {
    today: ledger().today,
    budgets,
    metrics: {
      planned,
      spent,
      remaining: planned - spent,
      categoriesSet: set.length,
    },
  };
}

export function getMockSubscriptionsData(): SubscriptionsData {
  const { transactions, subscriptions, bills, cardPayment } = ledger();
  const now = Date.now();
  const seen = new Set<string>();
  return {
    subscriptions,
    bills,
    cardPayment,
    transactionChoices: transactions
      .filter((item) => item.amount < 0 && !item.pending && isCashFlow(item))
      .filter((item) => {
        const key = item.merchantName ?? item.name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12)
      .map((item) => ({
        id: item.id,
        merchant: item.merchantName ?? item.name,
        amount: Math.abs(item.amount),
        occurredAt: `${item.date}T12:00:00Z`,
        category: item.category,
      })),
    dismissed: [],
    metrics: {
      billsMonthly: bills.reduce((sum, item) => sum + item.amount, 0),
      cardBalance: Math.abs(BALANCES.card.balance),
      monthlyEstimate: subscriptions.reduce((sum, item) => sum + item.monthlyEquivalent, 0),
      annualEstimate: subscriptions.reduce((sum, item) => sum + item.annualized, 0),
      dueNext30Days: subscriptions
        .filter((item) => {
          const expected = Date.parse(item.nextExpectedAt);
          return expected >= now && expected <= now + 30 * 86_400_000;
        })
        .reduce((sum, item) => sum + item.averageAmount, 0),
      detected: subscriptions.length,
    },
  };
}

function spendingTotals<T extends string>(
  rows: TransactionRow[],
  key: (item: TransactionRow) => T,
) {
  const totals = new Map<T, { value: number; count: number }>();
  for (const item of rows) {
    const entry = totals.get(key(item)) ?? { value: 0, count: 0 };
    entry.value -= item.amount;
    entry.count += 1;
    totals.set(key(item), entry);
  }
  return [...totals]
    .filter(([, entry]) => entry.value > 0)
    .sort((a, b) => b[1].value - a[1].value);
}

const CHART_MONTHS = 17;

export function getMockSpendingData(requestedMonth?: string): SpendingData {
  const { today, transactions } = ledger();
  const currentMonth = today.slice(0, 7);
  const availableMonths = Array.from({ length: HISTORY_MONTHS }, (_, index) =>
    `${shiftMonth(currentMonth, -index)}-01`,
  );
  const selectedMonth =
    availableMonths.find((month) => month.startsWith(requestedMonth ?? currentMonth)) ??
    availableMonths[0];
  const selected = selectedMonth.slice(0, 7);
  const monthly = monthlyFlows(transactions, currentMonth, CHART_MONTHS);
  const selectedIndex = monthly.findIndex((item) => item.month === selectedMonth);
  const spendRows = (month: string) =>
    transactions.filter(
      (item) => inMonth(item, month) && isCashFlow(item) && !isIncome(item),
    );
  const rows = spendRows(selected);
  const historyMonths = monthly
    .slice(Math.max(selectedIndex - 5, 0), selectedIndex + 1)
    .map((item) => item.month.slice(0, 7));
  const earlier = monthly
    .slice(Math.max(selectedIndex - 3, 0), Math.max(selectedIndex, 0))
    .filter((item) => item.spending > 0);
  const comparisons = earlier.map((item) => item.month.slice(0, 7));
  const categoryTotal = (category: string, month: string) =>
    Math.max(
      -spendRows(month)
        .filter((item) => (item.category ?? "OTHER") === category)
        .reduce((sum, item) => sum + item.amount, 0),
      0,
    );

  const categories = spendingTotals(rows, (item) => item.category ?? "OTHER")
    .slice(0, 12)
    .map(([category, entry]) => {
      const inCategory = rows.filter((item) => (item.category ?? "OTHER") === category);
      return {
        category,
        value: entry.value,
        previous: categoryTotal(category, historyMonths.at(-2) ?? ""),
        usual: comparisons.length
          ? comparisons.reduce((sum, month) => sum + categoryTotal(category, month), 0) /
            comparisons.length
          : null,
        history: historyMonths.map((month) => categoryTotal(category, month)),
        details: spendingTotals(inCategory, (item) => item.categoryDetailed ?? "").map(
          ([detail, total]) => ({ detail: detail || null, ...total }),
        ),
        merchants: spendingTotals(inCategory, (item) => item.merchantName ?? item.name)
          .slice(0, 4)
          .map(([merchant, total]) => ({ merchant, ...total })),
      };
    });

  const selectedFlow = monthly[selectedIndex];
  const incomeRows = transactions.filter(
    (item) => inMonth(item, selected) && isCashFlow(item) && isIncome(item),
  );

  return {
    today,
    selectedMonth,
    availableMonths,
    monthly,
    categories,
    limits: BUDGET_LIMITS,
    topMerchants: spendingTotals(rows, (item) => item.merchantName ?? item.name)
      .slice(0, 8)
      .map(([merchant, total]) => ({ merchant, ...total })),
    incomeSources: [...new Set(incomeRows.map((item) => item.merchantName ?? item.name))].map(
      (source) => {
        const matching = incomeRows.filter((item) => (item.merchantName ?? item.name) === source);
        return {
          source,
          value: matching.reduce((sum, item) => sum + item.amount, 0),
          count: matching.length,
        };
      },
    ).sort((a, b) => b.value - a.value),
    largest: [...rows]
      .filter((item) => item.amount < 0)
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        merchant: item.merchantName ?? item.name,
        value: -item.amount,
        date: item.date,
        category: item.category,
        categoryDetailed: item.categoryDetailed,
      })),
    metrics: {
      income: selectedFlow.income,
      spending: selectedFlow.spending,
      net: selectedFlow.net,
      topCategory: categories[0]
        ? { category: categories[0].category, value: categories[0].value }
        : null,
      savingsRate: selectedFlow.income
        ? (selectedFlow.net / selectedFlow.income) * 100
        : null,
      averageSpending: earlier.length
        ? earlier.reduce((sum, item) => sum + item.spending, 0) / earlier.length
        : null,
    },
  };
}

export function getMockConnectionsData(): ConnectionsData {
  const accounts = accountRows();
  const lastSuccessAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const connections = [
    { id: 1, institutionName: "Clearwater Bank", state: "connected" as const, accountIds: [2] },
    { id: 2, institutionName: "Mercury Community", state: "connected" as const, accountIds: [1] },
    { id: 3, institutionName: "Northstar Investing", state: "connected" as const, accountIds: [4, 5] },
    { id: 4, institutionName: "Summit Credit", state: "needs-reconnect" as const, accountIds: [3] },
  ];
  return {
    issues: [],
    unmanagedAccounts: 0,
    connections: connections.map(({ accountIds, ...connection }) => ({
      ...connection,
      message: connection.state === "needs-reconnect" ? summitAttention().message : null,
      lastSuccessAt:
        connection.state === "needs-reconnect" ? summitAttention().lastSuccessAt : lastSuccessAt,
      accounts: accounts
        .filter((account) => accountIds.includes(account.id))
        .map(({ name, mask, type, balance }) => ({ name, mask, type, balance })),
    })),
  };
}
