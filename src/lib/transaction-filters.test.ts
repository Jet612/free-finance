import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TransactionRow } from "@/lib/detail-data";

import {
  DEFAULT_FILTERS,
  filterTransactions,
  hasActiveFilters,
  parseTransactionFilters,
  transactionFiltersQuery,
  transactionsCsv,
  cashFlowTotals,
} from "./transaction-filters";

const periodStarts = {
  mtd: "2026-11-01",
  last30Days: "2026-10-07",
  last90Days: "2026-08-08",
  ytd: "2026-01-01",
};

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: 1,
    date: "2026-11-02",
    name: "SHELL OIL",
    merchantName: "Shell",
    category: "TRANSPORTATION",
    amount: -40,
    accountName: "Rewards card",
    pending: false,
    originalDescription: null,
    ...overrides,
  } as TransactionRow;
}

describe("parseTransactionFilters", () => {
  it("defaults to the last 30 days", () => {
    assert.deepEqual(parseTransactionFilters({}), DEFAULT_FILTERS);
  });

  it("reads everything from a link", () => {
    const filters = parseTransactionFilters({
      q: " shell ",
      category: "TRANSPORTATION",
      month: "2026-10",
      status: "pending",
    });
    assert.equal(filters.q, "shell");
    assert.equal(filters.category, "TRANSPORTATION");
    assert.equal(filters.month, "2026-10");
    assert.equal(filters.status, "pending");
  });

  it("searches all time when a link points at something specific", () => {
    assert.equal(parseTransactionFilters({ q: "shell" }).period, "all");
    assert.equal(parseTransactionFilters({ open: "42" }).period, "all");
    assert.equal(parseTransactionFilters({ account: "Rewards card" }).period, "all");
  });

  it("ignores values it doesn't recognize", () => {
    const filters = parseTransactionFilters({
      period: "forever",
      month: "2026-13",
      status: "lost",
    });
    assert.equal(filters.period, "last30Days");
    assert.equal(filters.month, null);
    assert.equal(filters.status, "all");
  });
});

describe("transactionFiltersQuery", () => {
  it("stays empty for the defaults", () => {
    assert.equal(transactionFiltersQuery(DEFAULT_FILTERS), "");
    assert.equal(hasActiveFilters(DEFAULT_FILTERS), false);
  });

  it("round-trips through a link", () => {
    const filters = { ...DEFAULT_FILTERS, q: "whole foods", category: "FOOD_AND_DRINK", period: "ytd" as const };
    const parsed = parseTransactionFilters(
      Object.fromEntries(new URLSearchParams(transactionFiltersQuery(filters))),
    );
    assert.deepEqual(parsed, filters);
  });
});

describe("filterTransactions", () => {
  const rows = [
    row({ id: 1, date: "2026-11-02" }),
    row({ id: 2, date: "2026-09-15", merchantName: "Whole Foods", name: "WFM", category: "FOOD_AND_DRINK" }),
    row({ id: 3, date: "2026-11-01", pending: true, accountName: "Everyday checking" }),
  ];
  const ids = (filters: Partial<typeof DEFAULT_FILTERS>) =>
    filterTransactions(rows, { ...DEFAULT_FILTERS, ...filters }, periodStarts).map((item) => item.id);

  it("limits to the period", () => {
    assert.deepEqual(ids({}), [1, 3]);
    assert.deepEqual(ids({ period: "all" }), [1, 2, 3]);
  });

  it("uses a specific month instead of the period", () => {
    assert.deepEqual(ids({ month: "2026-09" }), [2]);
  });

  it("searches merchants, and readable category names", () => {
    assert.deepEqual(ids({ period: "all", q: "whole" }), [2]);
    assert.deepEqual(ids({ period: "all", q: "food and drink" }), [2]);
  });

  it("searches subcategories and amounts", () => {
    const found = filterTransactions(
      [row({ id: 9, amount: -386.2, categoryDetailed: "FOOD_AND_DRINK_GROCERIES" })],
      { ...DEFAULT_FILTERS, period: "all", q: "386" },
      periodStarts,
    );
    assert.equal(found.length, 1);
    assert.equal(
      filterTransactions(
        [row({ id: 9, categoryDetailed: "FOOD_AND_DRINK_GROCERIES" })],
        { ...DEFAULT_FILTERS, period: "all", q: "grocer" },
        periodStarts,
      ).length,
      1,
    );
  });

  it("combines filters", () => {
    assert.deepEqual(ids({ account: "Everyday checking", status: "pending" }), [3]);
    assert.deepEqual(ids({ category: "FOOD_AND_DRINK" }), []);
  });
});

describe("cashFlowTotals", () => {
  it("matches what the Spending page counts", () => {
    const totals = cashFlowTotals([
      row({ amount: -40 }),
      row({ amount: 2000, category: "INCOME" }),
      row({ amount: -500, category: "TRANSFER_OUT" }),
      row({ amount: 500, category: "TRANSFER_IN" }),
      row({ amount: -900, category: "LOAN_PAYMENTS", categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }),
      row({ amount: -6, pending: true }),
      row({ amount: -75, ignored: true }),
    ]);
    assert.deepEqual(totals, { income: 2000, spending: 40, notCounted: 5 });
  });

  it("treats a refund as less spending, not as income", () => {
    const totals = cashFlowTotals([
      row({ amount: -100 }),
      row({ amount: 30, category: "GENERAL_MERCHANDISE" }),
    ]);
    assert.deepEqual(totals, { income: 0, spending: 70, notCounted: 0 });
  });

  it("never reports negative spending", () => {
    assert.equal(cashFlowTotals([row({ amount: 30, category: "TRAVEL" })]).spending, 0);
  });
});

describe("transactionsCsv", () => {
  it("quotes commas and quotes", () => {
    const csv = transactionsCsv([row({ merchantName: 'Joe\'s "Best", Inc' })]);
    assert.match(csv.split("\n")[1], /"Joe's ""Best"", Inc"/);
  });

  it("keeps a merchant name from running as a spreadsheet formula", () => {
    const csv = transactionsCsv([row({ merchantName: "=HYPERLINK(1)" })]);
    assert.match(csv.split("\n")[1], /'=HYPERLINK\(1\)/);
  });

  it("leaves a negative amount as a number", () => {
    const csv = transactionsCsv([row({ amount: -40 })]);
    assert.match(csv.split("\n")[1], /,-40,Posted$/);
  });
});
