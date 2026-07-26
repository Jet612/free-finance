import assert from "node:assert/strict";
import test from "node:test";

import {
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
