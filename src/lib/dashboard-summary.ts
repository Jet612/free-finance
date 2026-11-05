/**
 * Everything the Today page derives from raw figures. Pure and shared, so the
 * real dashboard and the demo are always calculated the same way.
 */
import { categoryLabel } from "@/lib/categories";
import type { AccountRow, DataHealth, UpcomingBill } from "@/lib/data";
import type { BudgetRow } from "@/lib/detail-data";
import { formatDateTime } from "@/lib/format";
import {
  averageMonthlySpending,
  buildInsights,
  buildMonthPace,
  buildVerdict,
  creditUtilization,
  cushionMonths,
  expectedMonthlyIncome,
  monthlyShortfall,
  savingsRate,
  type CreditAccount,
  type DailySpend,
  type Insight,
  type MonthlyFlow,
  type MonthPace,
  type UnusualCharge,
  type Verdict,
} from "@/lib/insights";
import { markMoney, markWholeMoney } from "@/lib/money-text";
import type {
  CardPaymentSchedule,
  RecurringBill,
  SubscriptionInsight,
} from "@/lib/subscription-detection";

const DAY_MS = 86_400_000;
const UPCOMING_WINDOW_DAYS = 30;
const SOON_WINDOW_DAYS = 14;
const UPCOMING_BILL_LIMIT = 8;

export type NetWorthBreakdown = {
  cash: number;
  investments: number;
  credit: number;
  loans: number;
  other: number;
};

export type Vitals = {
  cashAfterBills: number;
  cardBalances: number;
  /** Bills and subscriptions, without the card payment. */
  billsNext30Days: number;
  /** Everything leaving soon, including what's owed on cards. */
  dueNext30Days: number;
  billsDueCount: number;
  /** Share of income kept over the last three finished months. */
  savingsRate: number | null;
  averageSpending: number | null;
  /** How many months of normal spending the cash on hand would cover. */
  cushionMonths: number | null;
  creditUtilization: number | null;
  /** Total limit across cards that share one. */
  creditLimit: number | null;
};

export type DashboardSummary = {
  verdict: Verdict;
  /** Everyday spending only, so a bill landing early can't look like overspending. */
  pace: MonthPace;
  /** Everything spent so far, bills included, and where the month is heading. */
  allSpending: { spent: number; projected: number | null; expectedIncome: number | null };
  vitals: Vitals;
  breakdown: NetWorthBreakdown;
  upcomingBills: UpcomingBill[];
  insights: Insight[];
};

function isSavings(account: AccountRow): boolean {
  return account.type.toLowerCase().includes("savings");
}

function everydayCash(accounts: AccountRow[]): number {
  return accounts
    .filter((item) => item.accountType === "depository" && !isSavings(item))
    .reduce((sum, item) => sum + (item.availableBalance ?? item.balance), 0);
}

function creditAccounts(accounts: AccountRow[]): CreditAccount[] {
  return accounts
    .filter((item) => item.accountType === "credit")
    .map((item) => ({
      name: item.name,
      owed: Math.abs(item.balance),
      available: item.availableBalance ?? null,
    }));
}

function netWorthBreakdown(accounts: AccountRow[]): NetWorthBreakdown {
  const breakdown = { cash: 0, investments: 0, credit: 0, loans: 0, other: 0 };
  for (const account of accounts) {
    if (account.accountType === "depository") breakdown.cash += account.balance;
    else if (account.accountType === "investment") breakdown.investments += account.balance;
    else if (account.accountType === "credit") breakdown.credit += account.balance;
    else if (account.accountType === "loan") breakdown.loans += account.balance;
    else breakdown.other += account.balance;
  }
  return breakdown;
}

function upcoming(
  subscriptions: SubscriptionInsight[],
  bills: RecurringBill[],
  now: number,
  days: number,
): UpcomingBill[] {
  const charges: UpcomingBill[] = [
    ...subscriptions.map((item) => ({
      merchant: item.merchant,
      amount: item.averageAmount,
      expectedAt: item.nextExpectedAt,
      category: item.category,
      cadence: item.cadence as string,
    })),
    ...bills.map((item) => ({
      merchant: item.merchant,
      amount: item.amount,
      expectedAt: item.nextExpectedAt,
      category: item.category,
      cadence: "Monthly",
    })),
  ];
  return charges
    .filter((bill) => {
      const expected = Date.parse(bill.expectedAt);
      // A day of slack, so something due today doesn't vanish this morning.
      return expected >= now - DAY_MS && expected <= now + days * DAY_MS;
    })
    .sort((a, b) => Date.parse(a.expectedAt) - Date.parse(b.expectedAt));
}

export function summarizeDashboard(input: {
  today: string;
  now: number;
  accounts: AccountRow[];
  cashOnHand: number;
  daily: DailySpend[];
  monthly: MonthlyFlow[];
  budgets: BudgetRow[];
  subscriptions: SubscriptionInsight[];
  bills: RecurringBill[];
  cardPayment: CardPaymentSchedule | null;
  unusual: UnusualCharge[];
  health: DataHealth;
}): DashboardSummary {
  const { cashOnHand, health, monthly, now, subscriptions, today } = input;
  const accounts = input.accounts.filter((item) => item.inNetWorth !== false);
  const credit = creditAccounts(accounts);
  const cardBalances = credit.reduce((sum, item) => sum + item.owed, 0);
  const scheduled = upcoming(subscriptions, input.bills, now, UPCOMING_WINDOW_DAYS);
  const billsNext30Days = scheduled.reduce((sum, bill) => sum + bill.amount, 0);
  // Cards are counted in cash-after-bills already, so this only joins the list
  // of what's coming, never the bills total, or it would be taken off twice.
  const cardDue: UpcomingBill | null =
    input.cardPayment && cardBalances > 0
      ? {
          merchant: "Credit card payment",
          amount: cardBalances,
          expectedAt: input.cardPayment.nextExpectedAt,
          category: "LOAN_PAYMENTS",
          cadence: "Monthly",
          kind: "card",
        }
      : null;
  const within = (bill: UpcomingBill, days: number) =>
    Date.parse(bill.expectedAt) <= now + days * DAY_MS;
  const due = [
    ...scheduled,
    ...(cardDue && within(cardDue, UPCOMING_WINDOW_DAYS) ? [cardDue] : []),
  ].sort((a, b) => Date.parse(a.expectedAt) - Date.parse(b.expectedAt));
  const dueNext30Days = due.reduce((sum, bill) => sum + bill.amount, 0);
  const billsNext14Days = due
    .filter((bill) => within(bill, SOON_WINDOW_DAYS))
    .reduce((sum, bill) => sum + bill.amount, 0);
  const averageSpending = averageMonthlySpending(monthly, today);
  const fixed = new Set([
    ...subscriptions.map((item) => item.merchant),
    ...input.bills.map((item) => item.merchant),
  ]);
  const pace = buildMonthPace(
    input.daily.filter((entry) => !entry.merchant || !fixed.has(entry.merchant)),
    today,
  );
  const everything = buildMonthPace(input.daily, today);
  const cashAfterBills = cashOnHand - cardBalances - billsNext30Days;
  const checking = everydayCash(accounts);
  const knownLimits = credit.filter((item) => item.available !== null);

  return {
    verdict: buildVerdict({
      pace,
      cashAfterBills,
      billsNext30Days: dueNext30Days,
      checkingShort: billsNext14Days > 0 && checking < billsNext14Days,
      outOfDate: health.attention.map((item) => item.institution),
      driver: input.unusual[0] ?? null,
      monthlyShortfall: monthlyShortfall(monthly, today),
      projectedSpending: everything.projected,
      expectedIncome: expectedMonthlyIncome(monthly, today),
      formatWhole: markWholeMoney,
    }),
    pace,
    allSpending: {
      spent: everything.spent,
      projected: everything.projected,
      expectedIncome: expectedMonthlyIncome(monthly, today),
    },
    breakdown: netWorthBreakdown(accounts),
    upcomingBills: due.slice(0, UPCOMING_BILL_LIMIT),
    vitals: {
      cashAfterBills,
      cardBalances,
      billsNext30Days,
      dueNext30Days,
      billsDueCount: due.length,
      savingsRate: savingsRate(monthly, today),
      averageSpending,
      cushionMonths: cushionMonths(cashOnHand, averageSpending),
      creditUtilization: creditUtilization(credit),
      creditLimit: knownLimits.length
        ? knownLimits.reduce((sum, item) => sum + item.owed + (item.available ?? 0), 0)
        : null,
    },
    insights: buildInsights({
      today,
      health: {
        stale: health.stale,
        lastUpdatedLabel: health.lastUpdatedAt
          ? formatDateTime(health.lastUpdatedAt)
          : null,
        attention: health.attention,
      },
      budgets: input.budgets.map((budget) => ({
        ...budget,
        label: categoryLabel(budget.category),
      })),
      subscriptions,
      unusual: input.unusual,
      checking,
      billsNext14Days,
      credit,
      format: markMoney,
      formatWhole: markWholeMoney,
    }),
  };
}
