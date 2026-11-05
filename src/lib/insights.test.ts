import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  averageMonthlySpending,
  expectedMonthlyIncome,
  budgetState,
  buildInsights,
  buildMonthPace,
  buildVerdict,
  creditUtilization,
  cushionMonths,
  monthlyShortfall,
  savingsRate,
  visibleInsights,
  type MonthlyFlow,
} from "./insights";

const money = (value: number) => `$${value.toFixed(2)}`;

const flow = (month: string, income: number, spending: number): MonthlyFlow => ({
  month,
  income,
  spending,
  net: income - spending,
});

function insightInput(overrides: Partial<Parameters<typeof buildInsights>[0]> = {}) {
  return {
    today: "2026-11-15",
    health: { stale: false, lastUpdatedLabel: null, attention: [] },
    budgets: [],
    subscriptions: [],
    unusual: [],
    checking: 5000,
    billsNext14Days: 0,
    credit: [],
    format: money,
    ...overrides,
  };
}

describe("buildMonthPace", () => {
  const daily = [
    { date: "2026-08-01", value: 1000 },
    { date: "2026-08-20", value: 500 },
    { date: "2026-09-01", value: 1200 },
    { date: "2026-09-20", value: 300 },
    { date: "2026-10-01", value: 800 },
    { date: "2026-10-31", value: 700 },
    { date: "2026-11-01", value: 900 },
    { date: "2026-11-03", value: 100 },
  ];

  it("compares this month with the same point in recent months", () => {
    const pace = buildMonthPace(daily, "2026-11-05");
    assert.equal(pace.spent, 1000);
    assert.equal(pace.usualByNow, 1000);
    assert.equal(pace.usualTotal, 1500);
    assert.equal(pace.comparisonMonths, 3);
  });

  it("projects what's left in a typical month on top of what's spent", () => {
    assert.equal(buildMonthPace(daily, "2026-11-05").projected, 1500);
  });

  it("leaves future days empty but keeps the usual line going", () => {
    const pace = buildMonthPace(daily, "2026-11-05");
    assert.equal(pace.points.length, 30);
    assert.equal(pace.points[4].spent, 1000);
    assert.equal(pace.points[5].spent, null);
    assert.equal(pace.points[29].usual, 1500 - 700 / 3);
  });

  it("handles a shorter comparison month", () => {
    const pace = buildMonthPace(
      [
        { date: "2026-02-28", value: 280 },
        { date: "2026-03-31", value: 10 },
      ],
      "2026-03-31",
    );
    assert.equal(pace.usualTotal, 280);
    assert.equal(pace.points[30].usual, 280);
  });

  it("says nothing about usual without any history", () => {
    const pace = buildMonthPace([{ date: "2026-11-02", value: 40 }], "2026-11-05");
    assert.equal(pace.spent, 40);
    assert.equal(pace.usualByNow, null);
    assert.equal(pace.projected, null);
  });

  it("never lets a refund take the running total below zero", () => {
    const pace = buildMonthPace([{ date: "2026-11-02", value: -40 }], "2026-11-05");
    assert.equal(pace.spent, 0);
  });
});

describe("savings and cushion", () => {
  const monthly = [
    flow("2026-07-01", 5000, 4000),
    flow("2026-08-01", 5000, 4000),
    flow("2026-09-01", 5000, 4500),
    flow("2026-10-01", 5000, 3500),
    flow("2026-11-01", 5000, 200),
  ];

  it("ignores the month in progress", () => {
    assert.equal(savingsRate(monthly, "2026-11-05"), 20);
  });

  it("has no rate without finished months of income", () => {
    assert.equal(savingsRate([flow("2026-11-01", 5000, 200)], "2026-11-05"), null);
  });

  it("averages the same three finished months used everywhere", () => {
    assert.equal(averageMonthlySpending(monthly, "2026-11-05"), 4000);
    assert.equal(
      averageMonthlySpending([flow("2026-06-01", 0, 9000), ...monthly], "2026-11-05"),
      4000,
    );
  });

  it("skips empty months from before the first sync", () => {
    assert.equal(
      averageMonthlySpending(
        [flow("2026-09-01", 0, 0), flow("2026-10-01", 5000, 3000)],
        "2026-11-05",
      ),
      3000,
    );
  });

  it("expects a usual month's income, or more if it's already arrived", () => {
    assert.equal(expectedMonthlyIncome(monthly, "2026-11-05"), 5000);
    assert.equal(
      expectedMonthlyIncome([...monthly.slice(0, 4), flow("2026-11-01", 8000, 200)], "2026-11-05"),
      8000,
    );
    assert.equal(expectedMonthlyIncome([], "2026-11-05"), null);
  });

  it("sees when spending has been running above income", () => {
    assert.equal(monthlyShortfall(monthly, "2026-11-05"), null);
    assert.equal(
      monthlyShortfall(
        [flow("2026-09-01", 4000, 5000), flow("2026-10-01", 4000, 4600)],
        "2026-11-05",
      ),
      800,
    );
  });

  it("measures cash in months of spending", () => {
    assert.equal(cushionMonths(12000, 4000), 3);
    assert.equal(cushionMonths(12000, null), null);
    assert.equal(cushionMonths(-50, 4000), 0);
  });
});

describe("buildVerdict", () => {
  const pace = (spent: number, usualByNow: number | null) => ({
    ...buildMonthPace([], "2026-11-05"),
    spent,
    usualByNow,
  });
  const verdict = (overrides: Partial<Parameters<typeof buildVerdict>[0]> = {}) =>
    buildVerdict({
      pace: pace(900, 1000),
      checkingShort: false,
      cashAfterBills: 5000,
      billsNext30Days: 0,
      outOfDate: [],
      driver: null,
      monthlyShortfall: null,
      projectedSpending: null,
      expectedIncome: null,
      formatWhole: (value) => `$${Math.round(value)}`,
      ...overrides,
    });

  it("says you're on track when you are", () => {
    assert.equal(verdict().tone, "good");
    assert.equal(verdict().headline, "You're on track this month");
  });

  it("stays calm about a fast month that still ends well", () => {
    const calm = verdict({
      pace: pace(1300, 1000),
      projectedSpending: 3800,
      expectedIncome: 4900,
    });
    assert.equal(calm.tone, "good");
    assert.equal(calm.headline, "You're on track this month");
    assert.match(calm.detail, /\$300 above usual/);
    assert.match(calm.detail, /keep about \$1100/);
  });

  it("warns when the month looks set to cost more than comes in", () => {
    const risky = verdict({ projectedSpending: 5200, expectedIncome: 4900 });
    assert.equal(risky.tone, "watch");
    assert.equal(risky.headline, "This month may cost more than you earn");
    assert.match(risky.detail, /\$5200/);
  });

  it("falls back to pace when there's no income to judge against", () => {
    assert.equal(verdict({ pace: pace(1300, 1000) }).tone, "watch");
    assert.equal(verdict({ pace: pace(1030, 1000) }).tone, "good");
    assert.equal(verdict({ pace: pace(40, 20) }).tone, "good");
  });

  it("puts running short ahead of everything", () => {
    assert.equal(verdict({ checkingShort: true }).tone, "urgent");
    assert.equal(verdict({ cashAfterBills: -10 }).tone, "urgent");
  });

  it("makes no claim without any history", () => {
    assert.equal(verdict({ pace: pace(100, null) }).headline, "Here's where you stand");
  });

  it("explains itself, naming the charge behind it", () => {
    const { detail } = verdict({
      pace: pace(1300, 1000),
      driver: { merchant: "REI", amount: 200 },
      billsNext30Days: 500,
    });
    assert.equal(detail, "Everyday spending is $300 above usual by now, mainly because of REI. $500 is due in the next 30 days.");
  });

  it("doesn't blame a charge too small to explain it", () => {
    const { detail } = verdict({
      pace: pace(1300, 1000),
      driver: { merchant: "REI", amount: 60 },
    });
    assert.equal(detail, "Everyday spending is $300 above usual by now.");
  });

  it("won't say on track when a connection is broken", () => {
    const stale = verdict({ outOfDate: ["Summit Credit"] });
    assert.equal(stale.tone, "watch");
    assert.equal(stale.headline, "Mostly on track, but Summit Credit is out of date");
  });

  it("gives no forecast it can't back up while a feed is out of date", () => {
    const stale = verdict({
      outOfDate: ["Summit Credit"],
      projectedSpending: 3800,
      expectedIncome: 4900,
    });
    assert.doesNotMatch(stale.detail, /keep about/);
  });

  it("won't call a month on track while spending outruns income", () => {
    const short = verdict({ monthlyShortfall: 320 });
    assert.equal(short.tone, "watch");
    assert.equal(short.headline, "You're spending more than you earn");
    assert.match(short.detail, /\$320 a month above income/);
  });

  it("names the shortfall even if this month looks calm", () => {
    assert.equal(verdict({ pace: pace(500, 1000), monthlyShortfall: 50 }).tone, "watch");
  });
});

describe("creditUtilization", () => {
  it("is what's owed against the total limit", () => {
    assert.equal(
      creditUtilization([{ name: "Card", owed: 1000, available: 9000 }]),
      10,
    );
  });

  it("skips cards that don't share available credit", () => {
    assert.equal(
      creditUtilization([{ name: "Card", owed: 1000, available: null }]),
      null,
    );
  });
});

describe("budgetState", () => {
  it("flags spending that's ahead of the calendar", () => {
    assert.equal(budgetState(80, 40), "ahead");
  });

  it("stays calm when spending keeps up with the month", () => {
    assert.equal(budgetState(60, 55), "ok");
  });

  it("doesn't nag about a small budget early in the month", () => {
    assert.equal(budgetState(30, 5), "ok");
  });

  it("knows when a budget is gone", () => {
    assert.equal(budgetState(104, 90), "over");
    assert.equal(budgetState(null, 90), "none");
  });
});

describe("buildInsights", () => {
  it("is empty when nothing needs attention", () => {
    assert.deepEqual(buildInsights(insightInput()), []);
  });

  it("puts a broken connection first", () => {
    const [first] = buildInsights(
      insightInput({
        budgets: [
          { category: "FOOD_AND_DRINK", label: "Food & drink", spent: 120, monthlyLimit: 100, percent: 120 },
        ],
        health: {
          stale: false,
          lastUpdatedLabel: null,
          attention: [{ id: 3, institution: "Summit Credit", message: "", needsReconnect: true }],
        },
      }),
    );
    assert.equal(first.title, "Sign in to Summit Credit again");
    assert.equal(first.action, "Reconnect");
  });

  it("warns when checking won't cover what's due soon", () => {
    const [first] = buildInsights(
      insightInput({ checking: 100, billsNext14Days: 400 }),
    );
    assert.equal(first.id, "cash-short");
    assert.match(first.detail, /\$400\.00/);
  });

  it("names how far over a budget is", () => {
    const [first] = buildInsights(
      insightInput({
        budgets: [
          { category: "TRAVEL", label: "Travel", spent: 150, monthlyLimit: 100, percent: 150 },
        ],
      }),
    );
    assert.equal(first.title, "Travel is $50.00 over budget");
  });

  it("reports a recent price rise, and only a recent one", () => {
    const subscription = {
      ruleId: null,
      streamKey: "streamly",
      merchant: "Streamly",
      category: "ENTERTAINMENT",
      averageAmount: 17.99,
      monthlyEquivalent: 17.99,
      annualized: 215.88,
      cadence: "Monthly" as const,
      occurrences: 6,
      lastChargedAt: "2026-11-01",
      nextExpectedAt: "2026-12-01",
      confidence: "Likely" as const,
      source: "Automatic" as const,
      previousAmount: 15.49,
      priceChangedAt: "2026-10-20",
    };
    const [rise] = buildInsights(insightInput({ subscriptions: [subscription] }));
    assert.equal(rise.title, "Streamly went up $2.50");
    assert.match(rise.detail, /up from \$15\.49/);

    assert.deepEqual(
      buildInsights(
        insightInput({
          subscriptions: [{ ...subscription, priceChangedAt: "2026-03-01" }],
        }),
      ),
      [],
    );
  });

  it("describes a price drop as a drop", () => {
    const [drop] = buildInsights(
      insightInput({
        subscriptions: [
          {
            ruleId: null,
            streamKey: "s",
            merchant: "Streamly",
            category: null,
            averageAmount: 10,
            monthlyEquivalent: 10,
            annualized: 120,
            cadence: "Monthly",
            occurrences: 6,
            lastChargedAt: "2026-11-01",
            nextExpectedAt: "2026-12-01",
            confidence: "Likely",
            source: "Automatic",
            previousAmount: 12,
            priceChangedAt: "2026-11-01",
          },
        ],
      }),
    );
    assert.equal(drop.title, "Streamly went down $2.00");
    assert.match(drop.detail, /down from \$12\.00/);
  });

  it("links an unusual charge straight to the transaction", () => {
    const [charge] = buildInsights(
      insightInput({
        unusual: [{ id: 42, category: "TRANSPORTATION", merchant: "Shell", amount: 300, typical: 48, date: "2026-11-14" }],
      }),
    );
    assert.equal(charge.href, "/transactions?open=42");
  });

  it("tells one cause once, inside the budget alert", () => {
    const insights = buildInsights(
      insightInput({
        budgets: [
          { category: "GENERAL_MERCHANDISE", label: "Shopping", spent: 438, monthlyLimit: 350, percent: 125 },
        ],
        unusual: [
          { id: 7, category: "GENERAL_MERCHANDISE", merchant: "REI", amount: 386, typical: 67, date: "2026-11-14" },
        ],
      }),
    );
    assert.equal(insights.length, 1);
    assert.match(insights[0].detail, /Mostly \$386\.00 at REI/);
  });

  it("gives the date of the last good update", () => {
    const [first] = buildInsights(
      insightInput({
        health: {
          stale: false,
          lastUpdatedLabel: null,
          attention: [{ id: 3, institution: "Summit", message: "", needsReconnect: true, lastSuccessAt: "2026-10-28T07:00:00Z" }],
        },
      }),
    );
    assert.match(first.detail, /Oct 28/);
  });

  it("never lets a broken connection be waved away", () => {
    const [first] = buildInsights(
      insightInput({
        health: {
          stale: false,
          lastUpdatedLabel: null,
          attention: [{ id: 3, institution: "Summit", message: "", needsReconnect: true }],
        },
      }),
    );
    assert.equal(first.dismissible, false);
  });

  it("lets a budget alert come back next month after being dismissed", () => {
    const budgets = [
      { category: "TRAVEL", label: "Travel", spent: 150, monthlyLimit: 100, percent: 150 },
    ];
    const [november] = buildInsights(insightInput({ budgets }));
    const [december] = buildInsights(insightInput({ budgets, today: "2026-12-15" }));
    assert.equal(november.dismissible, true);
    assert.notEqual(november.id, december.id);
  });

  it("keeps the list short, after setting aside what's been dismissed", () => {
    const unusual = Array.from({ length: 9 }, (_, id) => ({
      id,
      category: "TRANSPORTATION",
      merchant: "Shell",
      amount: 300,
      typical: 48,
      date: "2026-11-14",
    }));
    const insights = buildInsights(insightInput({ unusual }));
    assert.equal(visibleInsights(insights, []).length, 5);
    const shown = visibleInsights(insights, ["unusual-0", "unusual-1"]);
    assert.equal(shown.length, 5);
    assert.equal(shown[0].id, "unusual-2");
  });
});
