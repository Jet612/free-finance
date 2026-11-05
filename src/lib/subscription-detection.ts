const DAY_MS = 86_400_000;
const MAX_RECENT_OCCURRENCES = 6;
const MIN_CHARGES_AT_OLD_PRICE = 2;
/** A bigger jump is more likely a different plan or a different purchase. */
const MAX_PRICE_CHANGE = 0.6;

export type SubscriptionCandidate = {
  merchant: string;
  description: string;
  category: string | null;
  categoryDetailed: string | null;
  transactionCode: string | null;
  amount: number;
  occurredAt: Date;
};

export type SubscriptionCadence =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "annual";

export type SubscriptionInsight = {
  ruleId: number | null;
  streamKey: string;
  merchant: string;
  category: string | null;
  averageAmount: number;
  monthlyEquivalent: number;
  annualized: number;
  cadence: "Weekly" | "Every 2 weeks" | "Monthly" | "Quarterly" | "Annual";
  occurrences: number;
  lastChargedAt: string;
  nextExpectedAt: string;
  confidence: "Strong match" | "Likely" | "Manual";
  source: "Automatic" | "Manual";
  /** What it cost before its latest price change, if it had one. */
  previousAmount: number | null;
  /** The first charge at the current price. */
  priceChangedAt: string | null;
};

type Cadence = {
  value: SubscriptionCadence;
  label: SubscriptionInsight["cadence"];
  days: number;
  toleranceDays: number;
  graceDays: number;
  minimumOccurrences: number;
  perYear: number;
};

const CADENCES: Cadence[] = [
  {
    value: "weekly",
    label: "Weekly",
    days: 7,
    toleranceDays: 1.5,
    graceDays: 2,
    minimumOccurrences: 3,
    perYear: 52,
  },
  {
    value: "biweekly",
    label: "Every 2 weeks",
    days: 14,
    toleranceDays: 2,
    graceDays: 4,
    minimumOccurrences: 3,
    perYear: 26,
  },
  {
    value: "monthly",
    label: "Monthly",
    days: 30.4375,
    toleranceDays: 3,
    graceDays: 5,
    minimumOccurrences: 3,
    perYear: 12,
  },
  {
    value: "quarterly",
    label: "Quarterly",
    days: 91.3125,
    toleranceDays: 7,
    graceDays: 10,
    minimumOccurrences: 3,
    perYear: 4,
  },
  {
    value: "annual",
    label: "Annual",
    days: 365.25,
    toleranceDays: 14,
    graceDays: 21,
    minimumOccurrences: 2,
    perYear: 1,
  },
];

const SUBSCRIPTION_DETAILS = new Set([
  "ENTERTAINMENT_MUSIC_AND_AUDIO",
  "ENTERTAINMENT_TV_AND_MOVIES",
  "ENTERTAINMENT_VIDEO_GAMES",
  "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS",
  "RENT_AND_UTILITIES_INTERNET_AND_CABLE",
  "RENT_AND_UTILITIES_TELEPHONE",
]);

const NON_SUBSCRIPTION_CATEGORIES = new Set([
  "BANK_FEES",
  "FOOD_AND_DRINK",
  "GENERAL_MERCHANDISE",
  "GOVERNMENT_AND_NON_PROFIT",
  "HOME_IMPROVEMENT",
  "INCOME",
  "LOAN_PAYMENTS",
  "MEDICAL",
  "TAXES",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "TRANSPORTATION",
  "TRAVEL",
]);

const SUBSCRIPTION_LANGUAGE =
  /\b(?:annual|annually|membership|monthly|recurring|subscription)\b/i;
const NON_SUBSCRIPTION_LANGUAGE =
  /\b(?:credit card payment|insurance premium|lease payment|loan payment|mortgage|rent)\b/i;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** How far a charge can drift and still count as the same price. */
function priceTolerance(amount: number): number {
  return Math.max(0.25, amount * 0.03);
}

function isStablePrice(amounts: number[], level: number): boolean {
  return amounts.every(
    (amount) => Math.abs(amount - level) <= priceTolerance(level),
  );
}

/**
 * Finds one clean price change: steady at an old price, then steady at a new
 * one. Without this, a service would drop off the list the moment it raised its
 * price, which is exactly when it's most worth seeing.
 */
function findPriceChange(amounts: number[]) {
  for (let split = amounts.length - 1; split >= MIN_CHARGES_AT_OLD_PRICE; split -= 1) {
    const before = amounts.slice(0, split);
    const after = amounts.slice(split);
    const previous = median(before);
    const current = median(after);
    if (
      isStablePrice(before, previous) &&
      isStablePrice(after, current) &&
      Math.abs(current - previous) > priceTolerance(previous) &&
      Math.abs(current - previous) / previous <= MAX_PRICE_CHANGE
    ) {
      return { split, previous, current };
    }
  }
  return null;
}

function normalizedMerchant(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/\b(?:payment|purchase|online|pos|debit|credit)\b/g, "")
    .replace(/[0-9#*]+/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

export function subscriptionStreamKey(
  candidate: Pick<SubscriptionCandidate, "merchant" | "categoryDetailed">,
): string {
  return `${normalizedMerchant(candidate.merchant)}:${candidate.categoryDetailed ?? "unclassified"}`;
}

function isSubscriptionLike(candidate: SubscriptionCandidate): boolean {
  const category = candidate.category ?? "";
  const detail = candidate.categoryDetailed ?? "";
  const description = `${candidate.merchant} ${candidate.description}`;
  const hasSubscriptionDetail = SUBSCRIPTION_DETAILS.has(detail);

  if (
    NON_SUBSCRIPTION_CATEGORIES.has(category) ||
    NON_SUBSCRIPTION_LANGUAGE.test(description) ||
    // Internet, cable, and phone plans are subscription-like; rent and
    // usage-based household bills are not.
    (category === "RENT_AND_UTILITIES" && !hasSubscriptionDetail)
  ) {
    return false;
  }

  return (
    candidate.transactionCode === "membership fee" ||
    hasSubscriptionDetail ||
    SUBSCRIPTION_LANGUAGE.test(description)
  );
}

function matchingCadence(
  intervals: number[],
  occurrences: number,
): Cadence | null {
  return (
    CADENCES.find(
      (cadence) =>
        occurrences >= cadence.minimumOccurrences &&
        intervals.every(
          (interval) =>
            Math.abs(interval - cadence.days) <= cadence.toleranceDays,
        ),
    ) ?? null
  );
}

export function deriveSubscriptions(
  candidates: SubscriptionCandidate[],
  now = new Date(),
): SubscriptionInsight[] {
  const groups = new Map<string, SubscriptionCandidate[]>();
  for (const candidate of candidates) {
    if (
      !Number.isFinite(candidate.amount) ||
      candidate.amount <= 0 ||
      !Number.isFinite(candidate.occurredAt.getTime()) ||
      !isSubscriptionLike(candidate)
    ) {
      continue;
    }

    const streamKey = subscriptionStreamKey(candidate);
    if (streamKey.startsWith(":")) continue;
    // Category detail prevents unrelated purchases from the same merchant from
    // being folded into one recurring stream.
    groups.set(streamKey, [...(groups.get(streamKey) ?? []), candidate]);
  }

  const subscriptions: SubscriptionInsight[] = [];
  for (const [streamKey, entries] of groups) {
    const ordered = [...entries]
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .slice(-MAX_RECENT_OCCURRENCES);
    if (ordered.length < 2) continue;

    const intervals = ordered.slice(1).map((entry, index) =>
      (entry.occurredAt.getTime() - ordered[index].occurredAt.getTime()) /
        DAY_MS,
    );
    const cadence = matchingCadence(intervals, ordered.length);
    if (!cadence) continue;

    const amounts = ordered.map((entry) => entry.amount);
    const medianAmount = median(amounts);
    const priceChange = isStablePrice(amounts, medianAmount)
      ? null
      : findPriceChange(amounts);
    if (!isStablePrice(amounts, medianAmount) && !priceChange) continue;

    const last = ordered.at(-1)!;
    const next = new Date(last.occurredAt.getTime() + cadence.days * DAY_MS);
    const expires = new Date(next.getTime() + cadence.graceDays * DAY_MS);
    // A missed renewal tombstones the stream instead of leaving stale charges
    // visible indefinitely.
    if (
      last.occurredAt.getTime() > now.getTime() + DAY_MS ||
      now.getTime() > expires.getTime()
    ) {
      continue;
    }

    // After a price change, only the new price says what it costs from here on.
    const averageAmount =
      priceChange?.current ??
      amounts.reduce((total, amount) => total + amount, 0) / amounts.length;
    const annualized = averageAmount * cadence.perYear;
    const maximumAmountDeviation = Math.max(
      ...amounts.map((amount) => Math.abs(amount - medianAmount)),
    );
    const maximumIntervalDeviation = Math.max(
      ...intervals.map((interval) => Math.abs(interval - cadence.days)),
    );

    subscriptions.push({
      ruleId: null,
      streamKey,
      merchant: last.merchant,
      category: last.category,
      averageAmount,
      monthlyEquivalent: annualized / 12,
      annualized,
      cadence: cadence.label,
      occurrences: ordered.length,
      lastChargedAt: last.occurredAt.toISOString(),
      nextExpectedAt: next.toISOString(),
      confidence:
        !priceChange &&
        ordered.length >= Math.max(4, cadence.minimumOccurrences) &&
        maximumAmountDeviation <= Math.max(0.1, medianAmount * 0.01) &&
        maximumIntervalDeviation <= cadence.toleranceDays / 2
          ? "Strong match"
          : "Likely",
      source: "Automatic",
      previousAmount: priceChange?.previous ?? null,
      priceChangedAt: priceChange
        ? ordered[priceChange.split].occurredAt.toISOString()
        : null,
    });
  }

  return subscriptions.sort(
    (a, b) => b.monthlyEquivalent - a.monthlyEquivalent,
  );
}

export function manualSubscriptionInsight(
  rule: {
    ruleId: number;
    streamKey: string;
    merchant: string;
    category: string | null;
    cadence: SubscriptionCadence;
    amount: number;
    lastChargedAt: Date;
  },
  now = new Date(),
): SubscriptionInsight {
  const cadence = CADENCES.find((item) => item.value === rule.cadence);
  if (!cadence) {
    throw new Error("Unsupported subscription cadence.");
  }

  const cadenceMs = cadence.days * DAY_MS;
  const elapsed = now.getTime() - rule.lastChargedAt.getTime();
  // Manual entries remain until the owner removes them. If a renewal is
  // overdue, show the next projected date instead of a stale date in the past.
  const periodsElapsed = Math.max(1, Math.ceil(elapsed / cadenceMs));
  const next = new Date(
    rule.lastChargedAt.getTime() + periodsElapsed * cadenceMs,
  );
  const annualized = rule.amount * cadence.perYear;

  return {
    ruleId: rule.ruleId,
    streamKey: rule.streamKey,
    merchant: rule.merchant,
    category: rule.category,
    averageAmount: rule.amount,
    monthlyEquivalent: annualized / 12,
    annualized,
    cadence: cadence.label,
    occurrences: 1,
    lastChargedAt: rule.lastChargedAt.toISOString(),
    nextExpectedAt: next.toISOString(),
    confidence: "Manual",
    source: "Manual",
    previousAmount: null,
    priceChangedAt: null,
  };
}

export type RecurringBill = {
  streamKey: string;
  merchant: string;
  category: string | null;
  /** The recent average, since a power bill is never the same twice. */
  amount: number;
  occurrences: number;
  lastChargedAt: string;
  nextExpectedAt: string;
};

const BILL_MIN_OCCURRENCES = 3;
const BILL_TOLERANCE_DAYS = 6;
const BILL_GRACE_DAYS = 12;
const BILL_MAX_SWING = 0.6;
const BILL_AVERAGE_OVER = 3;

function isBillLike(candidate: SubscriptionCandidate): boolean {
  const detail = candidate.categoryDetailed ?? "";
  if (detail === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return false;
  // Internet and phone plans are already counted as subscriptions.
  if (SUBSCRIPTION_DETAILS.has(detail)) return false;
  return (
    candidate.category === "RENT_AND_UTILITIES" ||
    candidate.category === "LOAN_PAYMENTS" ||
    detail.includes("INSURANCE")
  );
}

function sameDayNextMonth(date: Date): Date {
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 12),
  );
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return next;
}

/**
 * Monthly must-pays: rent, loans, utilities, insurance. Subscriptions leave these
 * out on purpose, but they're the biggest things due, so anything answering
 * "what will I have left" has to count them. Amounts may swing, unlike a
 * subscription, as long as the timing holds.
 */
export function deriveBills(
  candidates: SubscriptionCandidate[],
  now = new Date(),
): RecurringBill[] {
  const groups = new Map<string, SubscriptionCandidate[]>();
  for (const candidate of candidates) {
    if (
      !Number.isFinite(candidate.amount) ||
      candidate.amount <= 0 ||
      !Number.isFinite(candidate.occurredAt.getTime()) ||
      !isBillLike(candidate)
    ) {
      continue;
    }
    const streamKey = subscriptionStreamKey(candidate);
    if (streamKey.startsWith(":")) continue;
    groups.set(streamKey, [...(groups.get(streamKey) ?? []), candidate]);
  }

  const bills: RecurringBill[] = [];
  for (const [streamKey, entries] of groups) {
    const ordered = [...entries]
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .slice(-MAX_RECENT_OCCURRENCES);
    if (ordered.length < BILL_MIN_OCCURRENCES) continue;

    const monthly = ordered.slice(1).every((entry, index) => {
      const days =
        (entry.occurredAt.getTime() - ordered[index].occurredAt.getTime()) / DAY_MS;
      return Math.abs(days - 30.4375) <= BILL_TOLERANCE_DAYS;
    });
    if (!monthly) continue;

    const amounts = ordered.map((entry) => entry.amount);
    const typical = median(amounts);
    if (amounts.some((amount) => Math.abs(amount - typical) > typical * BILL_MAX_SWING)) {
      continue;
    }

    const last = ordered.at(-1)!;
    const due = sameDayNextMonth(last.occurredAt);
    // A missed month means it ended, not that it's forever overdue.
    if (now.getTime() > due.getTime() + BILL_GRACE_DAYS * DAY_MS) continue;

    const recent = amounts.slice(-BILL_AVERAGE_OVER);
    bills.push({
      streamKey,
      merchant: last.merchant,
      category: last.category,
      amount: recent.reduce((sum, amount) => sum + amount, 0) / recent.length,
      occurrences: ordered.length,
      lastChargedAt: last.occurredAt.toISOString(),
      // Late but expected any day still counts as due, not as paid.
      nextExpectedAt: new Date(Math.max(due.getTime(), now.getTime())).toISOString(),
    });
  }
  return bills.sort((a, b) => b.amount - a.amount);
}

export type CardPaymentSchedule = {
  merchant: string;
  nextExpectedAt: string;
};

/**
 * When the next credit card payment is likely to leave checking. The amount comes
 * from the card balance, not from past payments, because that's what's owed.
 */
export function deriveCardPayment(
  candidates: SubscriptionCandidate[],
  now = new Date(),
): CardPaymentSchedule | null {
  const payments = candidates
    .filter(
      (candidate) =>
        candidate.categoryDetailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" &&
        candidate.amount > 0 &&
        Number.isFinite(candidate.occurredAt.getTime()),
    )
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    .slice(-MAX_RECENT_OCCURRENCES);
  if (payments.length < BILL_MIN_OCCURRENCES) return null;

  const monthly = payments.slice(1).every((entry, index) => {
    const days =
      (entry.occurredAt.getTime() - payments[index].occurredAt.getTime()) / DAY_MS;
    return Math.abs(days - 30.4375) <= BILL_TOLERANCE_DAYS;
  });
  if (!monthly) return null;

  const last = payments.at(-1)!;
  const due = sameDayNextMonth(last.occurredAt);
  if (now.getTime() > due.getTime() + BILL_GRACE_DAYS * DAY_MS) return null;
  return {
    merchant: last.merchant,
    nextExpectedAt: new Date(Math.max(due.getTime(), now.getTime())).toISOString(),
  };
}
