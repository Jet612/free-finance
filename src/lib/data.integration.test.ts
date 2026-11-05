/**
 * Checks the numbers people actually see, using real SQL on a real database.
 * Needs a migrated scratch database, and wipes it on every test:
 *
 *   TEST_DATABASE_URL=postgres://... pnpm test:db
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";

import {
  monthStartInAppTimezone,
  sameDayLastMonth,
  subtractDays,
  todayInAppTimezone,
} from "./timezone";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe("dashboard numbers", { skip: !databaseUrl }, () => {
  let data: typeof import("@/lib/data");
  let detail: typeof import("@/lib/detail-data");
  let schema: typeof import("@/db/schema");
  let db: ReturnType<typeof import("@/db/client").getDb>;
  let sql: typeof import("drizzle-orm").sql;

  const today = todayInAppTimezone();
  const monthStart = monthStartInAppTimezone();
  const lastMonth = sameDayLastMonth(today);
  const lastMonthStart = `${lastMonth.slice(0, 7)}-01`;

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.POSTGRES_URL = "";
    data = await import("@/lib/data");
    detail = await import("@/lib/detail-data");
    schema = await import("@/db/schema");
    sql = (await import("drizzle-orm")).sql;
    db = (await import("@/db/client")).getDb();
  });

  after(async () => {
    await db.$client.end();
  });

  beforeEach(async () => {
    await db.execute(sql`
      truncate public.plaid_items, public.accounts, public.budgets,
        public.sync_states, public.subscription_rules restart identity cascade
    `);
  });

  let nextExternalId = 0;

  async function addAccount(
    overrides: Partial<typeof schema.accounts.$inferInsert> = {},
  ) {
    nextExternalId += 1;
    const [row] = await db
      .insert(schema.accounts)
      .values({
        source: "plaid",
        externalId: `account-${nextExternalId}`,
        institutionName: "Test Bank",
        name: `Account ${nextExternalId}`,
        accountType: "depository",
        accountSubtype: "checking",
        currentBalance: "1000",
        ...overrides,
      })
      .returning();
    return row;
  }

  async function addTransaction(
    accountId: number,
    amount: number,
    overrides: Partial<typeof schema.transactions.$inferInsert> = {},
  ) {
    nextExternalId += 1;
    await db.insert(schema.transactions).values({
      accountId,
      externalId: `transaction-${nextExternalId}`,
      transactionDate: monthStart,
      name: "Purchase",
      amount: String(amount),
      categoryPrimary: "FOOD_AND_DRINK",
      ...overrides,
    });
  }

  async function addSnapshot(accountId: number, date: string, balance: number) {
    await db.insert(schema.balanceSnapshots).values({
      accountId,
      snapshotDate: date,
      balance: String(balance),
    });
  }

  test("a credit card payment is neither income nor spending", async () => {
    const checking = await addAccount();
    const card = await addAccount({
      accountType: "credit",
      accountSubtype: "credit card",
    });
    await addTransaction(card.id, -100);
    // Paying the card moves money between your own accounts.
    await addTransaction(checking.id, -100, {
      categoryPrimary: "LOAN_PAYMENTS",
      categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
    });
    await addTransaction(card.id, 100, {
      categoryPrimary: "LOAN_PAYMENTS",
      categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
    });

    const { metrics } = await data.getDashboardData();
    assert.equal(metrics.monthlySpending, 100);
    assert.equal(metrics.monthlyIncome, 0);
  });

  test("real loan payments still count as spending", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -1500, {
      categoryPrimary: "LOAN_PAYMENTS",
      categoryDetailed: "LOAN_PAYMENTS_MORTGAGE_PAYMENT",
    });
    assert.equal((await data.getDashboardData()).metrics.monthlySpending, 1500);
  });

  test("a refund lowers spending instead of looking like income", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -80, {
      categoryPrimary: "GENERAL_MERCHANDISE",
    });
    await addTransaction(checking.id, 30, {
      categoryPrimary: "GENERAL_MERCHANDISE",
    });

    const { metrics, spending } = await data.getDashboardData();
    assert.equal(metrics.monthlySpending, 50);
    assert.equal(metrics.monthlyIncome, 0);
    assert.deepEqual(spending, [{ category: "GENERAL_MERCHANDISE", value: 50 }]);
  });

  test("income, transfers, and pending charges are handled", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, 3000, { categoryPrimary: "INCOME" });
    await addTransaction(checking.id, 200, { categoryPrimary: null });
    await addTransaction(checking.id, -500, { categoryPrimary: "TRANSFER_OUT" });
    await addTransaction(checking.id, 500, { categoryPrimary: "TRANSFER_IN" });
    await addTransaction(checking.id, -40, { pending: true });
    await addTransaction(checking.id, -60);

    const { metrics } = await data.getDashboardData();
    assert.equal(metrics.monthlyIncome, 3200);
    assert.equal(metrics.monthlySpending, 60);
    assert.equal(metrics.monthlyCashFlow, 3140);
  });

  test("spending can't go negative in a month of only refunds", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, 25);
    assert.equal((await data.getDashboardData()).metrics.monthlySpending, 0);
  });

  test("every page agrees on this month's totals", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, 3000, { categoryPrimary: "INCOME" });
    await addTransaction(checking.id, -120);
    await addTransaction(checking.id, 20);
    await addTransaction(checking.id, -300, {
      categoryPrimary: "LOAN_PAYMENTS",
      categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
    });
    await db.insert(schema.budgets).values({
      categoryPrimary: "FOOD_AND_DRINK",
      monthlyLimit: "500",
    });

    const [dashboard, spending, transactions, budgets] = await Promise.all([
      data.getDashboardData(),
      detail.getSpendingData(),
      detail.getTransactionsData(),
      detail.getBudgetsData(),
    ]);
    assert.equal(dashboard.metrics.monthlySpending, 100);
    assert.equal(spending.metrics.spending, 100);
    assert.equal(transactions.metrics.spending, 100);
    assert.equal(budgets.metrics.spent, 100);
    assert.equal(spending.metrics.income, dashboard.metrics.monthlyIncome);
    assert.equal(transactions.metrics.income, dashboard.metrics.monthlyIncome);
  });

  test("a day an account couldn't update isn't a drop in net worth", async () => {
    const bank = await addAccount({ currentBalance: "1000" });
    const brokerage = await addAccount({
      accountType: "investment",
      accountSubtype: "brokerage",
      currentBalance: "5000",
    });
    const twoDaysAgo = subtractDays(today, 2);
    const yesterday = subtractDays(today, 1);
    await addSnapshot(bank.id, twoDaysAgo, 1000);
    await addSnapshot(brokerage.id, twoDaysAgo, 5000);
    // The brokerage has no snapshot for these two days.
    await addSnapshot(bank.id, yesterday, 1000);
    await addSnapshot(bank.id, today, 1000);

    const { trend } = await data.getDashboardData();
    assert.deepEqual(
      trend.map((point) => point.value),
      [6000, 6000, 6000],
    );
  });

  test("the trend has a point for every day, even with no snapshot", async () => {
    const bank = await addAccount();
    await addSnapshot(bank.id, subtractDays(today, 3), 700);
    const { trend } = await data.getDashboardData();
    assert.equal(trend.length, 4);
    assert.equal(trend.at(-1)?.date, today);
  });

  test("reports no change with only one day of history", async () => {
    const bank = await addAccount();
    await addSnapshot(bank.id, today, 1000);
    const { metrics } = await data.getDashboardData();
    assert.equal(metrics.netWorthChange, null);
    assert.equal(metrics.netWorthChangeSince, null);
  });

  test("measures change from the start of a short history", async () => {
    const bank = await addAccount({ currentBalance: "1500" });
    await addSnapshot(bank.id, subtractDays(today, 10), 1000);
    await addSnapshot(bank.id, today, 1500);
    const { metrics } = await data.getDashboardData();
    assert.equal(metrics.netWorthChange, 500);
    assert.equal(metrics.netWorthChangePercent, 50);
    assert.equal(metrics.netWorthChangeSince, subtractDays(today, 10));
  });

  test("disconnected accounts leave totals and the trend", async () => {
    const bank = await addAccount({ currentBalance: "1000" });
    const old = await addAccount({
      source: "robinhood",
      accountType: "investment",
      currentBalance: "9000",
      connected: false,
    });
    await addSnapshot(bank.id, today, 1000);
    await addSnapshot(old.id, today, 9000);
    await db.insert(schema.holdings).values({
      accountId: old.id,
      externalId: "old",
      symbol: "OLD",
      name: "Old",
      assetType: "stock",
      quantity: "1",
      currentValue: "9000",
    });

    const dashboard = await data.getDashboardData();
    assert.equal(dashboard.metrics.netWorth, 1000);
    assert.equal(dashboard.metrics.investmentValue, 0);
    assert.equal(dashboard.accounts.length, 1);
    assert.deepEqual(
      dashboard.trend.map((point) => point.value),
      [1000],
    );

    const accounts = await detail.getAccountsData();
    assert.equal(accounts.metrics.assets, 1000);
    assert.equal(accounts.metrics.connected, 1);
    assert.equal((await detail.getInvestmentsData()).holdings.length, 0);
  });

  test("the overview and Investments page report the same value", async () => {
    // Accounts without holdings data still count, at their account balance.
    await addAccount({
      accountType: "investment",
      accountSubtype: "401k",
      currentBalance: "2500",
    });
    const brokerage = await addAccount({
      accountType: "investment",
      accountSubtype: "brokerage",
      currentBalance: "1000",
    });
    await db.insert(schema.holdings).values({
      accountId: brokerage.id,
      externalId: "s1",
      symbol: "VTI",
      name: "Fund",
      assetType: "etf",
      quantity: "2",
      currentValue: "900",
      costBasis: "700",
      unrealizedGain: "200",
    });

    const [dashboard, investments] = await Promise.all([
      data.getDashboardData(),
      detail.getInvestmentsData(),
    ]);
    assert.equal(dashboard.metrics.investmentValue, 3500);
    assert.equal(investments.metrics.value, 3500);
  });

  test("unknown cost basis is reported as unknown, not as zero", async () => {
    const shared = await addAccount({
      accountType: "investment",
      currentBalance: "1000",
    });
    await addAccount({ accountType: "investment", currentBalance: "2000" });
    await db.insert(schema.holdings).values([
      {
        accountId: shared.id,
        externalId: "s1",
        symbol: "VTI",
        name: "Fund",
        assetType: "etf",
        quantity: "1",
        currentValue: "600",
        costBasis: "500",
        unrealizedGain: "100",
      },
      {
        accountId: shared.id,
        externalId: "s2",
        symbol: "MYS",
        name: "Mystery",
        assetType: "equity",
        quantity: "1",
        currentValue: "400",
      },
    ]);

    const { accounts, holdings, metrics } = await detail.getInvestmentsData();
    assert.equal(metrics.gain, 100);
    assert.equal(metrics.gainIsPartial, true);
    assert.equal(accounts.find((item) => item.value === 2000)?.costBasis, null);
    assert.equal(holdings.find((item) => item.symbol === "MYS")?.gain, null);
    assert.equal(holdings[0].symbol, "VTI");
    assert.equal(holdings[0].share, 60);
  });

  test("groups the same holding across accounts and builds the allocation", async () => {
    const first = await addAccount({ accountType: "investment" });
    const second = await addAccount({ accountType: "investment" });
    const holding = {
      symbol: "VTI",
      name: "Fund",
      assetType: "etf",
      quantity: "1",
      currentValue: "300",
      costBasis: "200",
      unrealizedGain: "100",
    };
    await db.insert(schema.holdings).values([
      { ...holding, accountId: first.id, externalId: "a" },
      { ...holding, accountId: second.id, externalId: "b" },
      {
        ...holding,
        accountId: second.id,
        externalId: "c",
        symbol: "USD",
        assetType: "cash",
        currentValue: "200",
        costBasis: "200",
        unrealizedGain: "0",
      },
    ]);

    const { allocation, holdings } = await detail.getInvestmentsData();
    assert.deepEqual(
      holdings.map((item) => [item.symbol, item.value]),
      [
        ["VTI", 600],
        ["USD", 200],
      ],
    );
    assert.deepEqual(allocation, [
      { type: "etf", value: 600, percent: 75 },
      { type: "cash", value: 200, percent: 25 },
    ]);
  });

  test("compares this month's spending with the same point last month", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -40, { transactionDate: lastMonthStart });
    assert.equal(
      (await data.getDashboardData()).metrics.spentByThisPointLastMonth,
      40,
    );
  });

  test("has no comparison without last month's history", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -40);
    assert.equal(
      (await data.getDashboardData()).metrics.spentByThisPointLastMonth,
      null,
    );
  });

  test("cash on hand and money owed use the right accounts", async () => {
    await addAccount({ currentBalance: "1000", availableBalance: "900" });
    await addAccount({ accountSubtype: "savings", currentBalance: "500" });
    await addAccount({ accountType: "credit", currentBalance: "-300" });
    await addAccount({ accountType: "loan", currentBalance: "-2000" });

    const { metrics } = await data.getDashboardData();
    assert.equal(metrics.cashOnHand, 1400);
    assert.equal(metrics.moneyOwed, 2300);
    assert.equal(metrics.netWorth, -800);
  });

  test("spending shows top merchants and last month's categories", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -30, { merchantName: "Cafe" });
    await addTransaction(checking.id, -20, { merchantName: "Cafe" });
    await addTransaction(checking.id, -10, { merchantName: "Deli" });
    await addTransaction(checking.id, -80, { transactionDate: lastMonthStart });
    await addTransaction(checking.id, 1000, { categoryPrimary: "INCOME" });

    const { categories, metrics, topMerchants } =
      await detail.getSpendingData();
    assert.deepEqual(topMerchants, [
      { merchant: "Cafe", value: 50, count: 2 },
      { merchant: "Deli", value: 10, count: 1 },
    ]);
    assert.deepEqual(categories, [
      { category: "FOOD_AND_DRINK", value: 60, previous: 80 },
    ]);
    assert.equal(metrics.savingsRate, 94);
    assert.equal(metrics.averageSpending, 80);
  });

  test("flags stale data and connections that need attention", async () => {
    await addAccount();
    await db.insert(schema.plaidItems).values([
      {
        itemId: "fresh",
        institutionName: "Fresh Bank",
        accessTokenEncrypted: "x",
        lastSuccessAt: new Date(Date.now() - 37 * 3_600_000),
      },
      {
        itemId: "broken",
        institutionName: "Broken Bank",
        accessTokenEncrypted: "x",
        status: "login_required",
        lastErrorMessage: "Broken Bank needs you to sign in again.",
      },
    ]);

    const { health } = await data.getDashboardData();
    assert.equal(health.stale, true);
    assert.deepEqual(health.attention, [
      {
        id: health.attention[0].id,
        institution: "Broken Bank",
        message: "Broken Bank needs you to sign in again.",
        needsReconnect: true,
      },
    ]);
  });

  test("a recent update isn't stale, and neither is a first import", async () => {
    await addAccount();
    assert.equal((await data.getDashboardData()).health.stale, false);
    await db.insert(schema.plaidItems).values({
      itemId: "fresh",
      institutionName: "Fresh Bank",
      accessTokenEncrypted: "x",
      lastSuccessAt: new Date(Date.now() - 20 * 3_600_000),
    });
    assert.equal((await data.getDashboardData()).health.stale, false);
  });

  test("the first screen knows when nothing is connected", async () => {
    assert.equal((await data.getDashboardData()).health.hasConnections, false);
  });

  test("the Connections page never carries the encrypted token", async () => {
    await db.insert(schema.plaidItems).values({
      itemId: "item-1",
      institutionName: "Test Bank",
      accessTokenEncrypted: "v1.super.secret.ciphertext",
    });
    await addAccount({ metadata: { item_id: "item-1" } });

    const result = await data.getConnectionsData();
    assert.doesNotMatch(JSON.stringify(result), /super\.secret|ciphertext/);
    assert.equal(result.connections[0].state, "importing");
    assert.equal(result.connections[0].accounts.length, 1);
    assert.equal(result.unmanagedAccounts, 0);
  });

  test("older accounts with no saved connection are pointed out", async () => {
    await addAccount({ metadata: { item_id: "from-an-older-version" } });
    assert.equal((await data.getConnectionsData()).unmanagedAccounts, 1);

    await db.insert(schema.plaidItems).values({
      itemId: "something-else",
      institutionName: "Test Bank",
      accessTokenEncrypted: "x",
    });
    assert.equal((await data.getConnectionsData()).unmanagedAccounts, 1);
  });
});
