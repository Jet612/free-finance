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
        public.sync_states, public.subscription_rules, public.merchant_rules
        restart identity cascade
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
    return db
      .insert(schema.transactions)
      .values({
        accountId,
        externalId: `transaction-${nextExternalId}`,
        transactionDate: monthStart,
        name: "Purchase",
        amount: String(amount),
        categoryPrimary: "FOOD_AND_DRINK",
        ...overrides,
      })
      .returning();
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

  test("money sent through a payment app is spending, money received isn't income", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -275, {
      categoryPrimary: "PAYMENT_APPS",
      categoryDetailed: null,
    });
    await addTransaction(checking.id, 104, {
      categoryPrimary: "TRANSFER_IN",
      categoryDetailed: "TRANSFER_IN_TRANSFER_IN_FROM_APPS",
    });

    const { metrics, spending } = await data.getDashboardData();
    assert.equal(metrics.monthlySpending, 275);
    assert.equal(metrics.monthlyIncome, 0);
    assert.deepEqual(
      spending.map((item) => item.category),
      ["PAYMENT_APPS"],
    );
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
    assert.equal(categories.length, 1);
    assert.equal(categories[0].category, "FOOD_AND_DRINK");
    assert.equal(categories[0].value, 60);
    assert.equal(categories[0].previous, 80);
    assert.equal(categories[0].usual, 80);
    assert.deepEqual(categories[0].history.slice(-2), [80, 60]);
    assert.deepEqual(categories[0].details, [
      { detail: null, value: 60, count: 3 },
    ]);
    assert.deepEqual(categories[0].merchants, [
      { merchant: "Cafe", value: 50, count: 2 },
      { merchant: "Deli", value: 10, count: 1 },
    ]);
    assert.equal(metrics.savingsRate, 94);
    assert.equal(metrics.averageSpending, 80);
  });

  test("spending splits a category and names income and big purchases", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -40, {
      merchantName: "Grocer",
      categoryDetailed: "FOOD_AND_DRINK_GROCERIES",
    });
    await addTransaction(checking.id, -15, {
      merchantName: "Cafe",
      categoryDetailed: "FOOD_AND_DRINK_COFFEE",
    });
    await addTransaction(checking.id, 2000, {
      merchantName: "Acme Payroll",
      categoryPrimary: "INCOME",
    });

    const { categories, incomeSources, largest } =
      await detail.getSpendingData();
    assert.deepEqual(
      categories[0].details.map((item) => [item.detail, item.value]),
      [
        ["FOOD_AND_DRINK_GROCERIES", 40],
        ["FOOD_AND_DRINK_COFFEE", 15],
      ],
    );
    assert.deepEqual(incomeSources, [
      { source: "Acme Payroll", value: 2000, count: 1 },
    ]);
    assert.deepEqual(
      largest.map((item) => [item.merchant, item.value]),
      [
        ["Grocer", 40],
        ["Cafe", 15],
      ],
    );
  });

  test("today's pace compares with the same day in past months", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -100);
    await addTransaction(checking.id, -300, { transactionDate: lastMonthStart });

    const { pace, monthly } = await data.getDashboardData();
    assert.equal(pace.spent, 100);
    assert.equal(pace.usualByNow, 300);
    assert.equal(pace.usualTotal, 300);
    // Last month's spending all landed by today, so nothing typical is left.
    assert.equal(pace.projected, 100);
    assert.equal(pace.comparisonMonths, 1);
    assert.deepEqual(
      monthly.map((item) => [item.month, item.spending]),
      [
        [lastMonthStart, 300],
        [monthStart, 100],
      ],
    );
  });

  test("a charge far above normal for that merchant is called out", async () => {
    const checking = await addAccount();
    for (const daysAgo of [20, 40, 60]) {
      await addTransaction(checking.id, -40, {
        merchantName: "Shell",
        transactionDate: subtractDays(today, daysAgo),
      });
    }
    const [charge] = await addTransaction(checking.id, -200, {
      merchantName: "Shell",
      transactionDate: today,
    });
    await addTransaction(checking.id, -45, {
      merchantName: "Shell",
      transactionDate: today,
    });

    const { insights } = await data.getDashboardData();
    const unusual = insights.filter((item) => item.id.startsWith("unusual-"));
    assert.equal(unusual.length, 1);
    assert.equal(unusual[0].href, `/transactions?open=${charge.id}`);
    assert.match(unusual[0].detail, /\$40\.00/);
  });

  test("cash after bills takes off card balances", async () => {
    await addAccount({ currentBalance: "5000" });
    await addAccount({
      accountType: "credit",
      accountSubtype: "credit card",
      currentBalance: "-1000",
      availableBalance: "3000",
    });

    const { vitals, breakdown } = await data.getDashboardData();
    assert.equal(vitals.cardBalances, 1000);
    assert.equal(vitals.cashAfterBills, 4000);
    assert.equal(vitals.creditUtilization, 25);
    assert.equal(breakdown.cash, 5000);
    assert.equal(breakdown.credit, -1000);
  });

  test("the accounts page shows each account's 30-day change", async () => {
    const checking = await addAccount({ currentBalance: "1500" });
    await db.insert(schema.balanceSnapshots).values([
      {
        accountId: checking.id,
        snapshotDate: subtractDays(today, 40),
        balance: "1000",
      },
      { accountId: checking.id, snapshotDate: today, balance: "1500" },
    ]);

    const { accounts, metrics, trend } = await detail.getAccountsData();
    assert.equal(accounts[0].change30Days, 500);
    assert.equal(accounts[0].history?.length, 2);
    assert.equal(metrics.netWorth, 1500);
    assert.equal(trend.at(-1)?.value, 1500);
  });

  test("an account with no month-old balance has no 30-day change", async () => {
    await addAccount();
    const { accounts } = await detail.getAccountsData();
    assert.equal(accounts[0].change30Days, null);
    assert.deepEqual(accounts[0].history, []);
  });

  test("budgets know what a category usually runs", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -90, { transactionDate: lastMonthStart });
    await db
      .insert(schema.budgets)
      .values({ categoryPrimary: "TRAVEL", monthlyLimit: "500" });

    const { budgets } = await detail.getBudgetsData();
    const food = budgets.find((item) => item.category === "FOOD_AND_DRINK");
    const travel = budgets.find((item) => item.category === "TRAVEL");
    assert.equal(food?.spent, 0);
    assert.equal(food?.usual, 90);
    assert.equal(travel?.usual, null);
  });

  test("investment history carries market value as well as gain", async () => {
    const brokerage = await addAccount({ accountType: "investment" });
    await db.insert(schema.investmentSnapshots).values({
      accountId: brokerage.id,
      snapshotDate: today,
      marketValue: "1200",
      costBasis: "1000",
      unrealizedGain: "200",
    });

    const { history } = await detail.getInvestmentsData();
    assert.deepEqual(history, [{ date: today, value: 200, marketValue: 1200 }]);
  });

  test("a charge left out of totals leaves spending and budgets", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -100);
    await addTransaction(checking.id, -40, { ignored: true });

    const { metrics } = await data.getDashboardData();
    const { budgets } = await detail.getBudgetsData();
    assert.equal(metrics.monthlySpending, 100);
    assert.equal(budgets.find((item) => item.category === "FOOD_AND_DRINK")?.spent, 100);
  });

  test("rent counts toward what's due, even though it isn't a subscription", async () => {
    const checking = await addAccount({ currentBalance: "5000" });
    for (const daysAgo of [4, 34, 64, 94]) {
      await addTransaction(checking.id, -1000, {
        merchantName: "Landlord",
        categoryPrimary: "RENT_AND_UTILITIES",
        categoryDetailed: "RENT_AND_UTILITIES_RENT",
        transactionDate: subtractDays(today, daysAgo),
      });
    }

    const { vitals, upcomingBills } = await data.getDashboardData();
    const { subscriptions, bills, metrics } = await detail.getSubscriptionsData();
    assert.equal(subscriptions.length, 0);
    assert.equal(bills.length, 1);
    assert.equal(metrics.billsMonthly, 1000);
    assert.equal(vitals.billsNext30Days, 1000);
    assert.equal(vitals.cashAfterBills, 4000);
    assert.equal(upcomingBills[0].merchant, "Landlord");
  });

  test("a broken connection marks its accounts as out of date", async () => {
    await db.insert(schema.plaidItems).values({
      itemId: "broken",
      institutionName: "Broken Bank",
      accessTokenEncrypted: "x",
      status: "login_required",
    });
    await addAccount({ metadata: { item_id: "broken" } });
    await addAccount({ metadata: { item_id: "other" } });

    const { accounts } = await detail.getAccountsData();
    assert.deepEqual(
      accounts.map((item) => item.outOfDate).sort(),
      [false, true],
    );
  });

  test("usual means the same three months on every page", async () => {
    const checking = await addAccount();
    const months = [1, 2, 3, 4].map((back) => {
      const date = new Date(`${monthStart}T12:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() - back);
      return date.toISOString().slice(0, 10);
    });
    await addTransaction(checking.id, -100, { transactionDate: months[0] });
    await addTransaction(checking.id, -200, { transactionDate: months[1] });
    await addTransaction(checking.id, -300, { transactionDate: months[2] });
    // Older than three months, so it must not move the average.
    await addTransaction(checking.id, -9000, { transactionDate: months[3] });

    const { pace, vitals } = await data.getDashboardData();
    const { metrics } = await detail.getSpendingData();
    assert.equal(pace.usualTotal, 200);
    assert.equal(vitals.averageSpending, 200);
    assert.equal(metrics.averageSpending, 200);
  });

  test("filters reach history older than the page can hold", async () => {
    const checking = await addAccount();
    await db.insert(schema.transactions).values(
      Array.from({ length: 760 }, (_, index) => ({
        accountId: checking.id,
        externalId: `recent-${index}`,
        transactionDate: today,
        name: "Recent",
        amount: "-1",
        categoryPrimary: "FOOD_AND_DRINK",
      })),
    );
    const [old] = await addTransaction(checking.id, -50, {
      merchantName: "Old Merchant",
      categoryPrimary: "TRAVEL",
      transactionDate: subtractDays(today, 300),
    });
    const filters = {
      q: "",
      period: "all" as const,
      month: null,
      category: "all",
      account: "all",
      status: "all" as const,
    };

    const everything = await detail.getTransactionsData(filters);
    assert.equal(everything.serverFiltered, true);
    assert.equal(everything.transactions.length, 750);
    assert.equal(everything.totalCount, 761);
    assert.ok(everything.categories.includes("TRAVEL"));

    const month = subtractDays(today, 300).slice(0, 7);
    const scoped = await detail.getTransactionsData({ ...filters, month, category: "TRAVEL" });
    assert.deepEqual(scoped.transactions.map((item) => item.id), [old.id]);
    assert.equal(scoped.totalCount, 1);

    const searched = await detail.getTransactionsData({ ...filters, q: "old merch" });
    assert.deepEqual(searched.transactions.map((item) => item.id), [old.id]);

    const linked = await detail.getTransactionsData(
      { ...filters, period: "last30Days" },
      old.id,
    );
    assert.ok(linked.transactions.some((item) => item.id === old.id));
  });

  test("a pending charge shows up against its budget without counting as spent", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -40, { pending: true, transactionDate: today });

    const { budgets } = await detail.getBudgetsData();
    const food = budgets.find((item) => item.category === "FOOD_AND_DRINK");
    assert.equal(food?.spent, 0);
    assert.equal(food?.pending, 40);
  });

  test("the verdict won't call things on track while a connection is broken", async () => {
    await db.insert(schema.plaidItems).values({
      itemId: "broken",
      institutionName: "Broken Bank",
      accessTokenEncrypted: "x",
      status: "login_required",
    });
    await addAccount({ metadata: { item_id: "broken" } });

    const { verdict } = await data.getDashboardData();
    assert.equal(verdict.tone, "watch");
    assert.match(verdict.headline, /Broken Bank/);
  });

  test("a new bank's first import is reported as importing", async () => {
    await db.insert(schema.plaidItems).values({
      itemId: "new",
      institutionName: "New Bank",
      accessTokenEncrypted: "x",
    });

    const { health } = await data.getDashboardData();
    assert.equal(health.importing, true);
    assert.equal(health.hasConnections, false);
  });

  test("what's due includes the card payment, without counting cards twice", async () => {
    const checking = await addAccount({ currentBalance: "5000" });
    await addAccount({
      accountType: "credit",
      accountSubtype: "credit card",
      currentBalance: "-800",
      availableBalance: "1200",
    });
    for (const daysAgo of [10, 40, 70]) {
      await addTransaction(checking.id, -500, {
        merchantName: "Card Payment",
        categoryPrimary: "LOAN_PAYMENTS",
        categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
        transactionDate: subtractDays(today, daysAgo),
      });
    }

    const { vitals, upcomingBills } = await data.getDashboardData();
    assert.equal(vitals.billsNext30Days, 0);
    assert.equal(vitals.dueNext30Days, 800);
    assert.equal(vitals.cashAfterBills, 4200);
    assert.equal(upcomingBills[0].merchant, "Credit card payment");
    assert.equal(upcomingBills[0].amount, 800);
  });

  test("an account left out disappears from every total", async () => {
    const kept = await addAccount({ currentBalance: "1000" });
    const left = await addAccount({ currentBalance: "5000", inNetWorth: false });
    await addSnapshot(kept.id, today, 1000);
    await addSnapshot(left.id, today, 5000);

    const { metrics, trend, breakdown } = await data.getDashboardData();
    const accountsPage = await detail.getAccountsData();
    assert.equal(metrics.netWorth, 1000);
    assert.equal(metrics.cashOnHand, 1000);
    assert.equal(trend.at(-1)?.value, 1000);
    assert.equal(breakdown.cash, 1000);
    assert.equal(accountsPage.metrics.netWorth, 1000);
    assert.equal(accountsPage.accounts.length, 2);
  });

  test("an asset added by hand counts, and isn't reported as a problem", async () => {
    await addAccount({
      source: "manual",
      accountType: "other",
      accountSubtype: null,
      currentBalance: "300000",
    });

    const { metrics, breakdown } = await data.getDashboardData();
    const { unmanagedAccounts } = await data.getConnectionsData();
    assert.equal(metrics.netWorth, 300000);
    assert.equal(breakdown.other, 300000);
    assert.equal(unmanagedAccounts, 0);
  });

  test("the month chart holds still when an older month is chosen", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -100);
    await addTransaction(checking.id, -40, { transactionDate: subtractDays(monthStart, 100) });

    const older = subtractDays(monthStart, 100).slice(0, 7);
    const latest = await detail.getSpendingData();
    const chosen = await detail.getSpendingData(older);
    assert.equal(chosen.monthly.at(-1)?.month, latest.monthly.at(-1)?.month);
    assert.equal(chosen.metrics.spending, 40);
    assert.equal(chosen.selectedMonth.slice(0, 7), older);
  });

  test("past months can be compared with today's budgets", async () => {
    await db
      .insert(schema.budgets)
      .values({ categoryPrimary: "TRAVEL", monthlyLimit: "500" });
    const { limits } = await detail.getSpendingData();
    assert.deepEqual(limits, { TRAVEL: 500 });
  });

  test("a bill landing early isn't mistaken for overspending", async () => {
    const checking = await addAccount({ currentBalance: "9000" });
    // Rent normally lands tomorrow's date, and this month it came a day early.
    const usualDay = subtractDays(today, -1);
    for (const back of [1, 2, 3, 4]) {
      const date = new Date(`${usualDay}T12:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() - back);
      await addTransaction(checking.id, -1500, {
        merchantName: "Landlord",
        categoryPrimary: "RENT_AND_UTILITIES",
        categoryDetailed: "RENT_AND_UTILITIES_RENT",
        transactionDate: date.toISOString().slice(0, 10),
      });
    }
    await addTransaction(checking.id, -1500, {
      merchantName: "Landlord",
      categoryPrimary: "RENT_AND_UTILITIES",
      categoryDetailed: "RENT_AND_UTILITIES_RENT",
      transactionDate: today,
    });

    const { pace, allSpending, verdict } = await data.getDashboardData();
    assert.equal(pace.spent, 0);
    assert.equal(allSpending.spent, 1500);
    assert.notEqual(verdict.headline, "You're spending faster than usual");
  });

  test("recent months of overspending change the verdict", async () => {
    const checking = await addAccount({ currentBalance: "9000" });
    for (const back of [1, 2, 3]) {
      const date = new Date(`${monthStart}T12:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() - back);
      const transactionDate = date.toISOString().slice(0, 10);
      await addTransaction(checking.id, 1000, { categoryPrimary: "INCOME", transactionDate });
      await addTransaction(checking.id, -1300, { transactionDate });
    }

    const { verdict } = await data.getDashboardData();
    assert.equal(verdict.headline, "You're spending more than you earn");
  });

  test("a broken connection is named for the pages that show spending", async () => {
    const lastGood = new Date(Date.now() - 5 * 86_400_000);
    await db.insert(schema.plaidItems).values([
      {
        itemId: "broken",
        institutionName: "Broken Bank",
        accessTokenEncrypted: "x",
        status: "login_required",
        lastSuccessAt: lastGood,
      },
      { itemId: "fine", institutionName: "Fine Bank", accessTokenEncrypted: "x" },
    ]);

    const stale = await data.getStaleConnections();
    assert.equal(stale.length, 1);
    assert.equal(stale[0].institution, "Broken Bank");
    assert.ok(stale[0].lastSuccessAt);
  });

  test("searching by amount and subcategory reaches old history too", async () => {
    const checking = await addAccount();
    await db.insert(schema.transactions).values(
      Array.from({ length: 760 }, (_, index) => ({
        accountId: checking.id,
        externalId: `newer-${index}`,
        transactionDate: today,
        name: "Recent",
        amount: "-1",
        categoryPrimary: "FOOD_AND_DRINK",
      })),
    );
    const [old] = await addTransaction(checking.id, -386.2, {
      merchantName: "Old Store",
      categoryDetailed: "GENERAL_MERCHANDISE_SPORTING_GOODS",
      transactionDate: subtractDays(today, 300),
    });
    const filters = {
      q: "386",
      period: "all" as const,
      month: null,
      category: "all",
      account: "all",
      status: "all" as const,
    };

    const byAmount = await detail.getTransactionsData(filters);
    assert.deepEqual(byAmount.transactions.map((item) => item.id), [old.id]);
    const byDetail = await detail.getTransactionsData({ ...filters, q: "sporting" });
    assert.deepEqual(byDetail.transactions.map((item) => item.id), [old.id]);
  });

  test("transfers don't crowd out recent activity", async () => {
    const checking = await addAccount();
    await addTransaction(checking.id, -20, { merchantName: "Cafe", transactionDate: today });
    await addTransaction(checking.id, -500, {
      categoryPrimary: "TRANSFER_OUT",
      transactionDate: today,
    });
    await addTransaction(checking.id, -300, {
      categoryPrimary: "LOAN_PAYMENTS",
      categoryDetailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
      transactionDate: today,
    });

    const { recentTransactions } = await data.getDashboardData();
    assert.deepEqual(recentTransactions.map((item) => item.merchantName), ["Cafe"]);
  });

  test("cash with no cost basis isn't called a partial picture", async () => {
    const brokerage = await addAccount({ accountType: "investment" });
    await db.insert(schema.holdings).values([
      {
        accountId: brokerage.id,
        externalId: "a",
        symbol: "VTI",
        name: "Fund",
        assetType: "etf",
        quantity: "1",
        currentValue: "100",
        costBasis: "80",
        unrealizedGain: "20",
      },
      {
        accountId: brokerage.id,
        externalId: "b",
        symbol: "USD",
        name: "Cash",
        assetType: "cash",
        quantity: "50",
        currentValue: "50",
      },
    ]);

    const { metrics } = await detail.getInvestmentsData();
    assert.equal(metrics.gainIsPartial, false);
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
        lastSuccessAt: null,
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
