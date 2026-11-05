import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveBills,
  deriveCardPayment,
  deriveSubscriptions,
  manualSubscriptionInsight,
  type SubscriptionCandidate,
} from "./subscription-detection";

const NOW = new Date("2026-07-26T12:00:00Z");

function candidate(
  date: string,
  amount = 12,
  overrides: Partial<SubscriptionCandidate> = {},
): SubscriptionCandidate {
  return {
    merchant: "Example Streaming",
    description: "Example Streaming monthly subscription",
    category: "ENTERTAINMENT",
    categoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES",
    transactionCode: null,
    amount,
    occurredAt: new Date(`${date}T12:00:00Z`),
    ...overrides,
  };
}

test("requires three occurrences for non-annual subscriptions", () => {
  const result = deriveSubscriptions(
    [candidate("2026-07-12"), candidate("2026-07-19")],
    NOW,
  );

  assert.equal(result.length, 0);
});

test("removes a weekly stream after it misses its next renewal", () => {
  const result = deriveSubscriptions(
    [
      candidate("2026-01-03"),
      candidate("2026-01-10"),
      candidate("2026-01-17"),
    ],
    NOW,
  );

  assert.equal(result.length, 0);
});

test("rejects a stream when any recent interval is irregular", () => {
  const result = deriveSubscriptions(
    [
      candidate("2026-05-01"),
      candidate("2026-05-08"),
      candidate("2026-05-15"),
      candidate("2026-07-19"),
    ],
    NOW,
  );

  assert.equal(result.length, 0);
});

test("rejects recurring charges outside the narrow amount tolerance", () => {
  const result = deriveSubscriptions(
    [
      candidate("2026-05-25", 10),
      candidate("2026-06-25", 12),
      candidate("2026-07-25", 10),
    ],
    NOW,
  );

  assert.equal(result.length, 0);
});

test("excludes rent even when amount and timing are consistent", () => {
  const rent = {
    merchant: "Example Property",
    description: "Rent payment",
    category: "RENT_AND_UTILITIES",
    categoryDetailed: "RENT_AND_UTILITIES_RENT",
  };
  const result = deriveSubscriptions(
    [
      candidate("2026-05-01", 1_500, rent),
      candidate("2026-06-01", 1_500, rent),
      candidate("2026-07-01", 1_500, rent),
    ],
    NOW,
  );

  assert.equal(result.length, 0);
});

test("excludes usage-based household bills even when marked monthly", () => {
  const utility = {
    merchant: "Example Electric",
    description: "Monthly electric bill",
    category: "RENT_AND_UTILITIES",
    categoryDetailed: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY",
  };
  const result = deriveSubscriptions(
    [
      candidate("2026-05-01", 120, utility),
      candidate("2026-06-01", 120, utility),
      candidate("2026-07-01", 120, utility),
    ],
    NOW,
  );

  assert.equal(result.length, 0);
});

test("excludes ordinary repeated purchases such as ride shares", () => {
  const rideShare = {
    merchant: "Example Ride Share",
    description: "Ride share",
    category: "TRANSPORTATION",
    categoryDetailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES",
  };
  const result = deriveSubscriptions(
    [
      candidate("2026-07-11", 15, rideShare),
      candidate("2026-07-18", 15, rideShare),
      candidate("2026-07-25", 15, rideShare),
    ],
    NOW,
  );

  assert.equal(result.length, 0);
});

test("keeps an active monthly subscription with consistent charges", () => {
  const result = deriveSubscriptions(
    [
      candidate("2026-05-25", 12),
      candidate("2026-06-25", 12.25),
      candidate("2026-07-25", 12),
    ],
    NOW,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].cadence, "Monthly");
  assert.equal(result[0].occurrences, 3);
  assert.equal(result[0].source, "Automatic");
});

test("allows two occurrences for a current annual subscription", () => {
  const result = deriveSubscriptions(
    [candidate("2025-07-20", 99), candidate("2026-07-20", 99)],
    NOW,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].cadence, "Annual");
});

test("keeps a manual subscription until the owner removes it", () => {
  const result = manualSubscriptionInsight(
    {
      ruleId: 42,
      streamKey: "example-streaming:entertainment",
      merchant: "Example Streaming",
      category: "ENTERTAINMENT",
      cadence: "weekly",
      amount: 12,
      lastChargedAt: new Date("2026-01-17T12:00:00Z"),
    },
    NOW,
  );

  assert.equal(result.source, "Manual");
  assert.equal(result.ruleId, 42);
  assert.ok(Date.parse(result.nextExpectedAt) >= NOW.getTime());
});

const monthlyCharges = (amounts: number[]) =>
  amounts.map((amount, index) => ({
    merchant: "Streamly",
    description: "STREAMLY",
    category: "ENTERTAINMENT",
    categoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES",
    transactionCode: null,
    amount,
    occurredAt: new Date(Date.UTC(2026, index, 15)),
  }));
const AFTER_CHARGES = new Date(Date.UTC(2026, 5, 20));

test("keeps a subscription that raised its price and reports the change", () => {
  const [stream] = deriveSubscriptions(
    monthlyCharges([15.49, 15.49, 15.49, 15.49, 17.99, 17.99]),
    AFTER_CHARGES,
  );
  assert.equal(stream?.merchant, "Streamly");
  assert.equal(stream?.previousAmount, 15.49);
  assert.equal(stream?.averageAmount, 17.99);
  assert.equal(stream?.priceChangedAt, new Date(Date.UTC(2026, 4, 15)).toISOString());
  assert.equal(stream?.confidence, "Likely");
});

test("spots a change the first month it happens", () => {
  const [stream] = deriveSubscriptions(
    monthlyCharges([15.49, 15.49, 15.49, 15.49, 15.49, 17.99]),
    AFTER_CHARGES,
  );
  assert.equal(stream?.previousAmount, 15.49);
  assert.ok(Math.abs((stream?.annualized ?? 0) - 17.99 * 12) < 0.001);
});

test("reports no change for a steady price", () => {
  const [stream] = deriveSubscriptions(
    monthlyCharges([15.49, 15.49, 15.49, 15.49]),
    new Date(Date.UTC(2026, 3, 20)),
  );
  assert.equal(stream?.previousAmount, null);
  assert.equal(stream?.priceChangedAt, null);
});

test("still rejects charges that swing around with no steady price", () => {
  assert.equal(
    deriveSubscriptions(monthlyCharges([12, 19, 14, 22, 11, 18]), AFTER_CHARGES).length,
    0,
  );
});

test("treats a huge jump as something other than a price change", () => {
  assert.equal(
    deriveSubscriptions(monthlyCharges([10, 10, 10, 10, 30, 30]), AFTER_CHARGES).length,
    0,
  );
});

const bill = (
  amounts: number[],
  overrides: Partial<SubscriptionCandidate> = {},
): SubscriptionCandidate[] =>
  amounts.map((amount, index) => ({
    merchant: "Cedar Property Co.",
    description: "CEDAR PROPERTY CO",
    category: "RENT_AND_UTILITIES",
    categoryDetailed: "RENT_AND_UTILITIES_RENT",
    transactionCode: null,
    amount,
    occurredAt: new Date(Date.UTC(2026, index, 1, 12)),
    ...overrides,
  }));

test("rent counts as a bill even though it isn't a subscription", () => {
  const charges = bill([1780, 1780, 1780, 1780]);
  const now = new Date(Date.UTC(2026, 3, 20));
  assert.equal(deriveSubscriptions(charges, now).length, 0);
  const [rent] = deriveBills(charges, now);
  assert.equal(rent?.amount, 1780);
  assert.equal(rent?.nextExpectedAt.slice(0, 10), "2026-05-01");
});

test("a utility bill can vary month to month", () => {
  const [power] = deriveBills(
    bill([72, 118, 94, 101], {
      merchant: "City Power",
      categoryDetailed: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY",
    }),
    new Date(Date.UTC(2026, 3, 20)),
  );
  assert.ok(Math.abs((power?.amount ?? 0) - (118 + 94 + 101) / 3) < 0.001);
});

test("a mortgage is a bill, and a card payment is not", () => {
  const now = new Date(Date.UTC(2026, 3, 20));
  assert.equal(
    deriveBills(
      bill([900, 900, 900], {
        merchant: "Home Loan",
        category: "LOAN_PAYMENTS",
        categoryDetailed: "LOAN_PAYMENTS_MORTGAGE_PAYMENT",
      }),
      new Date(Date.UTC(2026, 2, 20)),
    ).length,
    1,
  );
  assert.equal(
    deriveBills(
      bill([900, 900, 900, 900], {
        category: "LOAN_PAYMENTS",
        categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      }),
      now,
    ).length,
    0,
  );
});

test("a phone plan stays a subscription and isn't counted twice as a bill", () => {
  assert.equal(
    deriveBills(
      bill([45, 45, 45, 45], {
        merchant: "Tidewater Mobile",
        categoryDetailed: "RENT_AND_UTILITIES_TELEPHONE",
      }),
      new Date(Date.UTC(2026, 3, 20)),
    ).length,
    0,
  );
});

test("a bill that stopped is dropped once it's clearly over", () => {
  assert.equal(
    deriveBills(bill([1780, 1780, 1780]), new Date(Date.UTC(2026, 5, 20))).length,
    0,
  );
});

test("a bill running late still counts as due", () => {
  const now = new Date(Date.UTC(2026, 3, 4, 12));
  const [rent] = deriveBills(bill([1780, 1780, 1780]), now);
  assert.equal(rent?.nextExpectedAt, now.toISOString());
});

test("charges with no monthly rhythm aren't bills", () => {
  const [first, second, third] = bill([60, 60, 60]);
  assert.equal(
    deriveBills(
      [
        first,
        { ...second, occurredAt: new Date(Date.UTC(2026, 0, 9)) },
        { ...third, occurredAt: new Date(Date.UTC(2026, 0, 16)) },
      ],
      new Date(Date.UTC(2026, 0, 20)),
    ).length,
    0,
  );
});

test("a regular card payment gives the date of the next one", () => {
  const payments = bill([900, 1100, 950], {
    merchant: "Summit Credit",
    category: "LOAN_PAYMENTS",
    categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
  });
  const schedule = deriveCardPayment(payments, new Date(Date.UTC(2026, 2, 20)));
  assert.equal(schedule?.nextExpectedAt.slice(0, 10), "2026-04-01");
});

test("no steady rhythm means no guess at a card payment date", () => {
  const [first, second, third] = bill([900, 900, 900], {
    category: "LOAN_PAYMENTS",
    categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
  });
  assert.equal(
    deriveCardPayment(
      [first, { ...second, occurredAt: new Date(Date.UTC(2026, 0, 9)) }, third],
      new Date(Date.UTC(2026, 2, 20)),
    ),
    null,
  );
});
