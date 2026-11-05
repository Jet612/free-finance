/**
 * Turns raw figures into what someone actually wants to know: am I on pace, how
 * much cushion do I have, and does anything need me? Pure and shared by the real
 * dashboard and the demo, so the two can't disagree.
 */
import type { SubscriptionInsight } from "@/lib/subscription-detection";

export type DailySpend = {
  date: string;
  value: number;
  /** Lets fixed bills be told apart from everyday spending. */
  merchant?: string;
};

export type MonthlyFlow = {
  month: string;
  income: number;
  spending: number;
  net: number;
};

export type PacePoint = {
  day: number;
  /** Null for days that haven't happened yet. */
  spent: number | null;
  usual: number | null;
};

export type MonthPace = {
  points: PacePoint[];
  today: number;
  daysInMonth: number;
  spent: number;
  /** A typical month's spending through this same day. */
  usualByNow: number | null;
  usualTotal: number | null;
  /** Spent so far, plus what a typical month still has to come. */
  projected: number | null;
  comparisonMonths: number;
};

const COMPARISON_MONTHS = 3;

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, number - 1 + by, 1));
  return shifted.toISOString().slice(0, 7);
}

export function daysInMonth(month: string): number {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
}

function cumulative(daily: DailySpend[], month: string): number[] {
  const days = new Array<number>(daysInMonth(month)).fill(0);
  for (const entry of daily) {
    if (monthKey(entry.date) === month) {
      days[Number(entry.date.slice(8, 10)) - 1] += entry.value;
    }
  }
  let total = 0;
  // A big refund can dip a day below zero, but the running total never does.
  return days.map((value) => {
    total += value;
    return Math.max(total, 0);
  });
}

export function buildMonthPace(daily: DailySpend[], today: string): MonthPace {
  const month = monthKey(today);
  const totalDays = daysInMonth(month);
  const todayNumber = Number(today.slice(8, 10));
  const current = cumulative(daily, month);

  const comparisons: number[][] = [];
  for (let back = 1; back <= COMPARISON_MONTHS; back += 1) {
    const past = cumulative(daily, shiftMonth(month, -back));
    if (past.at(-1)) comparisons.push(past);
  }
  const usualAt = (day: number) =>
    comparisons.length
      ? comparisons.reduce(
          // A shorter month has already finished by the 31st.
          (sum, past) => sum + past[Math.min(day, past.length) - 1],
          0,
        ) / comparisons.length
      : null;

  const spent = current[todayNumber - 1] ?? 0;
  const usualByNow = usualAt(todayNumber);
  const usualTotal = comparisons.length
    ? comparisons.reduce((sum, past) => sum + (past.at(-1) ?? 0), 0) /
      comparisons.length
    : null;

  return {
    points: current.map((value, index) => ({
      day: index + 1,
      spent: index < todayNumber ? value : null,
      usual: usualAt(index + 1),
    })),
    today: todayNumber,
    daysInMonth: totalDays,
    spent,
    usualByNow,
    usualTotal,
    projected:
      usualTotal !== null && usualByNow !== null
        ? spent + Math.max(usualTotal - usualByNow, 0)
        : null,
    comparisonMonths: comparisons.length,
  };
}

/** Finished months only: a month in progress always looks like you saved a lot. */
function finishedMonths(monthly: MonthlyFlow[], today: string): MonthlyFlow[] {
  const current = monthKey(today);
  return monthly
    .filter((item) => monthKey(item.month) < current)
    .filter((item) => item.income > 0 || item.spending > 0);
}

/** Share of income kept over recent finished months, as a percentage. */
export function savingsRate(
  monthly: MonthlyFlow[],
  today: string,
  months = COMPARISON_MONTHS,
): number | null {
  const recent = finishedMonths(monthly, today).slice(-months);
  const income = recent.reduce((sum, item) => sum + item.income, 0);
  const spending = recent.reduce((sum, item) => sum + item.spending, 0);
  return income > 0 ? ((income - spending) / income) * 100 : null;
}

/** "Usual" means the same thing everywhere: the last three finished months. */
/** What a month usually brings in, or this month's income if that's already more. */
export function expectedMonthlyIncome(
  monthly: MonthlyFlow[],
  today: string,
  months = COMPARISON_MONTHS,
): number | null {
  const recent = finishedMonths(monthly, today).slice(-months);
  const usual = recent.length
    ? recent.reduce((sum, item) => sum + item.income, 0) / recent.length
    : 0;
  const soFar =
    monthly.find((item) => monthKey(item.month) === monthKey(today))?.income ?? 0;
  const expected = Math.max(usual, soFar);
  return expected > 0 ? expected : null;
}

/** Average monthly overspend across recent finished months, if there is one. */
export function monthlyShortfall(
  monthly: MonthlyFlow[],
  today: string,
  months = COMPARISON_MONTHS,
): number | null {
  const recent = finishedMonths(monthly, today).slice(-months);
  const income = recent.reduce((sum, item) => sum + item.income, 0);
  if (!recent.length || income <= 0) return null;
  const spending = recent.reduce((sum, item) => sum + item.spending, 0);
  return spending > income ? (spending - income) / recent.length : null;
}

export function averageMonthlySpending(
  monthly: MonthlyFlow[],
  today: string,
  months = COMPARISON_MONTHS,
): number | null {
  const recent = finishedMonths(monthly, today).slice(-months);
  if (!recent.length) return null;
  return recent.reduce((sum, item) => sum + item.spending, 0) / recent.length;
}

/** How many months of normal spending the cash on hand would cover. */
export function cushionMonths(
  cash: number,
  monthlySpending: number | null,
): number | null {
  if (!monthlySpending || monthlySpending <= 0) return null;
  return Math.max(cash, 0) / monthlySpending;
}

export type CreditAccount = {
  name: string;
  owed: number;
  /** Null when the bank doesn't share available credit. */
  available: number | null;
};

export function creditUtilization(accounts: CreditAccount[]): number | null {
  const known = accounts.filter((item) => item.available !== null);
  const limit = known.reduce(
    (sum, item) => sum + item.owed + (item.available ?? 0),
    0,
  );
  if (limit <= 0) return null;
  return (known.reduce((sum, item) => sum + item.owed, 0) / limit) * 100;
}

export type InsightLevel = "urgent" | "watch" | "note";

export type Insight = {
  id: string;
  level: InsightLevel;
  title: string;
  detail: string;
  /** A path inside the app. The page adds the demo prefix when it needs one. */
  href: string;
  action: string;
  /** Things that are genuinely broken can't be waved away. */
  dismissible: boolean;
};

export type BudgetState = "over" | "ahead" | "ok" | "none";

/** Compares spending with how far through the month we are, not just the limit. */
export function budgetState(
  percent: number | null,
  monthProgress: number,
): BudgetState {
  if (percent === null) return "none";
  if (percent >= 100) return "over";
  if (percent >= 50 && percent >= monthProgress + 15) return "ahead";
  return "ok";
}

export type UnusualCharge = {
  id: number;
  category: string | null;
  merchant: string;
  amount: number;
  typical: number;
  date: string;
};

type InsightInput = {
  today: string;
  health: {
    stale: boolean;
    lastUpdatedLabel: string | null;
    attention: {
      id: number;
      institution: string;
      message: string;
      needsReconnect: boolean;
      lastSuccessAt?: string | null;
    }[];
  };
  budgets: {
    category: string;
    label: string;
    spent: number;
    monthlyLimit: number | null;
    percent: number | null;
  }[];
  subscriptions: SubscriptionInsight[];
  unusual: UnusualCharge[];
  /** Everyday money, not savings, compared with what's due soon. */
  checking: number;
  billsNext14Days: number;
  credit: CreditAccount[];
  format: (value: number) => string;
  /** For budgets, which are in whole dollars everywhere they appear. */
  formatWhole?: (value: number) => string;
};

const LEVEL_ORDER: Record<InsightLevel, number> = {
  urgent: 0,
  watch: 1,
  note: 2,
};
const RECENT_PRICE_CHANGE_DAYS = 60;
const HIGH_CREDIT_USE = 30;
const MAX_INSIGHTS = 5;

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to.slice(0, 10)}T12:00:00Z`).getTime() -
      new Date(`${from.slice(0, 10)}T12:00:00Z`).getTime()) /
      86_400_000,
  );
}

export type Verdict = {
  tone: "good" | "watch" | "urgent";
  headline: string;
  /** Says why, in a sentence or two. */
  detail: string;
};

const NOTABLE_PACE = 0.1;
const NOTABLE_PACE_DOLLARS = 50;

function joinNames(names: string[]): string {
  return names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : (names[0] ?? "");
}

/** The one-line answer to "am I OK?", and the reason for it. */
export function buildVerdict(input: {
  pace: MonthPace;
  checkingShort: boolean;
  cashAfterBills: number;
  billsNext30Days: number;
  /** Institutions whose balances can't be trusted right now. */
  outOfDate: string[];
  /** The charge most responsible, when one stands out. */
  driver: { merchant: string; amount: number } | null;
  /** How far spending has run above income lately, per month. Null if it hasn't. */
  monthlyShortfall: number | null;
  /** Where the month's total spending looks to be heading, bills included. */
  projectedSpending: number | null;
  /** What's likely to come in this month. */
  expectedIncome: number | null;
  formatWhole: (value: number) => string;
}): Verdict {
  const {
    driver,
    expectedIncome,
    formatWhole,
    monthlyShortfall,
    outOfDate,
    pace,
    projectedSpending,
  } = input;
  const difference = pace.usualByNow === null ? 0 : pace.spent - pace.usualByNow;
  const notable =
    pace.usualByNow !== null &&
    Math.abs(difference) >= NOTABLE_PACE_DOLLARS &&
    Math.abs(difference) >= pace.usualByNow * NOTABLE_PACE;
  const stale = joinNames(outOfDate);

  const paceLine =
    pace.usualByNow === null
      ? `You've spent ${formatWhole(pace.spent)} so far this month.`
      : !notable
        ? "Everyday spending is about usual for this point in the month."
        : difference > 0
          ? `Everyday spending is ${formatWhole(difference)} above usual by now${
              driver && driver.amount >= difference / 2
                ? `, mainly because of ${driver.merchant}`
                : ""
            }.`
          : `Everyday spending is ${formatWhole(-difference)} below usual by now.`;
  const billsLine =
    input.billsNext30Days > 0
      ? ` ${formatWhole(input.billsNext30Days)} is due in the next 30 days.`
      : "";
  // Being ahead of usual only matters if it changes how the month ends.
  const projectedKept =
    projectedSpending !== null && expectedIncome !== null
      ? expectedIncome - projectedSpending
      : null;
  // Missing card charges would make this look better than it is, so say nothing.
  const outlook =
    projectedKept !== null && projectedKept > 0 && !stale
      ? ` You're on course to keep about ${formatWhole(projectedKept)} this month.`
      : "";
  const detail = `${paceLine}${outlook || billsLine}`;

  if (input.checkingShort) {
    return { tone: "urgent", headline: "Checking may not cover what's due", detail };
  }
  if (input.cashAfterBills < 0) {
    return { tone: "urgent", headline: "You owe more than your cash covers", detail };
  }
  // A good month can't outvote a trend of spending more than comes in.
  if (monthlyShortfall !== null && monthlyShortfall > 0) {
    return {
      tone: "watch",
      headline: "You're spending more than you earn",
      detail: `Lately spending has run ${formatWhole(monthlyShortfall)} a month above income.${billsLine}`,
    };
  }
  if (projectedKept !== null && projectedKept < 0) {
    return {
      tone: "watch",
      headline: "This month may cost more than you earn",
      detail: `You're on course to spend about ${formatWhole(projectedSpending ?? 0)}, with about ${formatWhole(expectedIncome ?? 0)} coming in.${billsLine}`,
    };
  }
  // With no income history there's no outcome to judge, only the pace.
  if (projectedKept === null && notable && difference > 0) {
    return { tone: "watch", headline: "You're spending faster than usual", detail };
  }
  // Calling it "on track" needs numbers that can be trusted.
  if (stale) {
    return {
      tone: "watch",
      headline: `Mostly on track, but ${stale} ${outOfDate.length === 1 ? "is" : "are"} out of date`,
      detail,
    };
  }
  if (pace.usualByNow === null) {
    return { tone: "good", headline: "Here's where you stand", detail };
  }
  return { tone: "good", headline: "You're on track this month", detail };
}

/** What to show now: the cap comes after dismissals, so nothing is crowded out. */
export function visibleInsights(insights: Insight[], dismissed: string[]): Insight[] {
  return insights
    .filter((item) => !dismissed.includes(item.id))
    .slice(0, MAX_INSIGHTS);
}

export function buildInsights(input: InsightInput): Insight[] {
  const { format, today } = input;
  const whole = input.formatWhole ?? format;
  const insights: Insight[] = [];
  const dayOfMonth = Number(today.slice(8, 10));
  const totalDays = daysInMonth(monthKey(today));
  const daysLeft = totalDays - dayOfMonth;
  const monthProgress = (dayOfMonth / totalDays) * 100;

  for (const item of input.health.attention) {
    insights.push({
      id: `connection-${item.id}`,
      level: "urgent",
      title: item.needsReconnect
        ? `Sign in to ${item.institution} again`
        : `${item.institution} isn't updating`,
      detail: item.lastSuccessAt
        ? `Its last good update was ${shortDate(item.lastSuccessAt)}, so newer balances and spending are missing.`
        : "Its balances and transactions are out of date until this is fixed.",
      href: "/setup",
      action: item.needsReconnect ? "Reconnect" : "See details",
      dismissible: false,
    });
  }

  if (input.health.stale && !input.health.attention.length) {
    insights.push({
      id: "stale",
      level: "urgent",
      title: "Your numbers may be out of date",
      detail: input.health.lastUpdatedLabel
        ? `The last update was ${input.health.lastUpdatedLabel}. Updates normally run every morning.`
        : "Updates normally run every morning.",
      href: "/setup",
      action: "Check connections",
      dismissible: false,
    });
  }

  if (input.billsNext14Days > 0 && input.checking < input.billsNext14Days) {
    insights.push({
      id: "cash-short",
      level: "urgent",
      title: "Checking may not cover what's due",
      detail: `${format(input.billsNext14Days)} is expected in the next 2 weeks, and checking has ${format(input.checking)}.`,
      href: "/subscriptions",
      action: "See what's due",
      dismissible: false,
    });
  }

  // One cause, one alert: a big charge that broke a budget is told once, not twice.
  const explained = new Set<number>();
  for (const budget of input.budgets) {
    if (budget.monthlyLimit === null) continue;
    const state = budgetState(budget.percent, monthProgress);
    const cause =
      state === "over" || state === "ahead"
        ? input.unusual.find((charge) => charge.category === budget.category)
        : undefined;
    if (cause) explained.add(cause.id);
    const because = cause
      ? ` Mostly ${format(cause.amount)} at ${cause.merchant}, more than the usual ${format(cause.typical)}.`
      : "";
    if (state === "over") {
      insights.push({
        id: `budget-${monthKey(today)}-${budget.category}`,
        level: "watch",
        dismissible: true,
        title: `${budget.label} is ${whole(budget.spent - budget.monthlyLimit)} over budget`,
        detail: `${whole(budget.spent)} spent of ${whole(budget.monthlyLimit)}, with ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left.${because}`,
        href: "/budgets",
        action: "Review budget",
      });
    } else if (state === "ahead") {
      insights.push({
        id: `budget-${monthKey(today)}-${budget.category}`,
        level: "watch",
        dismissible: true,
        title: `${budget.label} is running ahead of budget`,
        detail: `${Math.round(budget.percent ?? 0)}% used, and the month is ${Math.round(monthProgress)}% over.${because}`,
        href: "/budgets",
        action: "Review budget",
      });
    }
  }

  for (const item of input.subscriptions) {
    if (
      item.previousAmount === null ||
      !item.priceChangedAt ||
      daysBetween(item.priceChangedAt, today) > RECENT_PRICE_CHANGE_DAYS
    ) {
      continue;
    }
    const change = item.averageAmount - item.previousAmount;
    insights.push({
      id: `price-${item.streamKey}`,
      level: change > 0 ? "watch" : "note",
      dismissible: true,
      title: `${item.merchant} ${change > 0 ? "went up" : "went down"} ${format(Math.abs(change))}`,
      detail: `Now ${format(item.averageAmount)}, ${change > 0 ? "up" : "down"} from ${format(item.previousAmount)}.`,
      href: "/subscriptions",
      action: "See subscriptions",
    });
  }

  for (const charge of input.unusual) {
    if (explained.has(charge.id)) continue;
    insights.push({
      id: `unusual-${charge.id}`,
      level: "note",
      dismissible: true,
      title: `${format(charge.amount)} at ${charge.merchant} is more than usual`,
      detail: `You normally spend about ${format(charge.typical)} there.`,
      href: `/transactions?open=${charge.id}`,
      action: "See charge",
    });
  }

  for (const account of input.credit) {
    const usage = creditUtilization([account]);
    if (usage !== null && usage >= HIGH_CREDIT_USE) {
      insights.push({
        id: `credit-${monthKey(today)}-${account.name}`,
        level: "note",
        dismissible: true,
        title: `${account.name} is at ${Math.round(usage)}% of its limit`,
        detail: "Keeping it under 30% helps your credit score.",
        href: "/accounts",
        action: "See account",
      });
    }
  }

  return insights.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}
