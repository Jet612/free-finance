import assert from "node:assert/strict";
import test from "node:test";

import {
  accountRow,
  holdingRows,
  investmentSnapshotRows,
  transactionRow,
} from "./mappers";
import type { PlaidAccount, PlaidTransaction } from "./types";

const syncedAt = new Date("2026-11-05T11:00:00Z");
const metadata = { item_id: "item", institution_id: "ins" };

function account(overrides: Partial<PlaidAccount>): PlaidAccount {
  return {
    account_id: "a1",
    name: "Checking",
    type: "depository",
    balances: { current: 100, available: 80 },
    ...overrides,
  };
}

function transaction(overrides: Partial<PlaidTransaction>): PlaidTransaction {
  return {
    transaction_id: "t1",
    account_id: "a1",
    date: "2026-11-01",
    amount: 10,
    pending: false,
    ...overrides,
  };
}

test("money owed counts against net worth", () => {
  for (const type of ["credit", "loan"]) {
    const row = accountRow(
      account({ type, balances: { current: 250 } }),
      "Bank",
      metadata,
      syncedAt,
    );
    assert.equal(row.currentBalance, "-250.0000");
  }
});

test("assets stay positive, and missing balances fall back", () => {
  assert.equal(
    accountRow(account({}), "Bank", metadata, syncedAt).currentBalance,
    "100.0000",
  );
  assert.equal(
    accountRow(
      account({ balances: { current: null, available: 42 } }),
      "Bank",
      metadata,
      syncedAt,
    ).currentBalance,
    "42.0000",
  );
  assert.equal(
    accountRow(account({ balances: {} }), "Bank", metadata, syncedAt)
      .availableBalance,
    null,
  );
});

test("flips Plaid's sign so money out is negative", () => {
  assert.equal(transactionRow(transaction({}), 1, syncedAt).amount, "-10.0000");
  assert.equal(
    transactionRow(transaction({ amount: -2500 }), 1, syncedAt).amount,
    "2500.0000",
  );
});

test("prefers the authorization time and never invents one", () => {
  const authorized = transactionRow(
    transaction({
      authorized_datetime: "2026-11-01T14:00:00Z",
      datetime: "2026-11-02T09:00:00Z",
    }),
    1,
    syncedAt,
  );
  assert.equal(
    authorized.transactionAt?.toISOString(),
    "2026-11-01T14:00:00.000Z",
  );
  assert.equal(transactionRow(transaction({}), 1, syncedAt).transactionAt, null);
  assert.equal(
    transactionRow(transaction({ datetime: "garbage" }), 1, syncedAt)
      .transactionAt,
    null,
  );
});

test("always has a name to show", () => {
  assert.equal(
    transactionRow(transaction({ merchant_name: "Cafe" }), 1, syncedAt).name,
    "Cafe",
  );
  assert.equal(transactionRow(transaction({}), 1, syncedAt).name, "Transaction");
});

const accountIds = new Map([["i1", 7]]);
const holding = {
  account_id: "i1",
  security_id: "s1",
  quantity: 2,
  institution_price: 50,
  institution_value: 100,
  cost_basis: 60,
};

test("computes gain from value and cost basis", () => {
  const [row] = holdingRows(
    [holding],
    [{ security_id: "s1", ticker_symbol: "vti", name: "Fund", type: "etf" }],
    accountIds,
    syncedAt,
  );
  assert.equal(row.symbol, "VTI");
  assert.equal(row.averageCost, "30.000000");
  assert.equal(row.unrealizedGain, "40.0000");
  assert.equal(row.unrealizedGainPercent, "66.666667");
});

test("an unknown cost basis is not reported as all profit", () => {
  const [row] = holdingRows(
    [{ ...holding, cost_basis: null }],
    [{ security_id: "s1", ticker_symbol: "VTI" }],
    accountIds,
    syncedAt,
  );
  assert.equal(row.costBasis, null);
  assert.equal(row.unrealizedGain, null);
  assert.equal(row.unrealizedGainPercent, null);
});

test("merges repeated lots of one security", () => {
  const rows = holdingRows(
    [holding, { ...holding, quantity: 3, institution_value: 150, cost_basis: 90 }],
    [{ security_id: "s1", ticker_symbol: "VTI" }],
    accountIds,
    syncedAt,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, "5");
  assert.equal(rows[0].currentValue, "250.0000");
  assert.equal(rows[0].costBasis, "150.0000");
});

test("one unknown lot makes the merged cost basis unknown", () => {
  const [row] = holdingRows(
    [holding, { ...holding, cost_basis: null }],
    [],
    accountIds,
    syncedAt,
  );
  assert.equal(row.costBasis, null);
});

test("cash has no gain and a readable symbol", () => {
  const [row] = holdingRows(
    [{ ...holding, quantity: 100, institution_price: 1, institution_value: 100, cost_basis: null }],
    [
      {
        security_id: "s1",
        ticker_symbol: "CUR:USD",
        type: "cash",
        is_cash_equivalent: true,
      },
    ],
    accountIds,
    syncedAt,
  );
  assert.equal(row.symbol, "USD");
  assert.equal(row.assetType, "cash");
  assert.equal(row.unrealizedGain, "0.0000");
});

test("skips empty positions and unknown accounts", () => {
  assert.deepEqual(
    holdingRows(
      [
        { ...holding, quantity: 0 },
        { ...holding, quantity: -1 },
        { ...holding, account_id: "other" },
      ],
      [],
      accountIds,
      syncedAt,
    ),
    [],
  );
});

test("a snapshot sums only what is known", () => {
  const rows = holdingRows(
    [
      holding,
      {
        ...holding,
        security_id: "s2",
        institution_value: 300,
        cost_basis: null,
      },
    ],
    [],
    accountIds,
    syncedAt,
  );
  assert.deepEqual(investmentSnapshotRows(rows, "2026-11-05"), [
    {
      accountId: 7,
      snapshotDate: "2026-11-05",
      marketValue: "400.0000",
      costBasis: "60.0000",
      unrealizedGain: "40.0000",
    },
  ]);
});
