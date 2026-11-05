/**
 * Runs the real sync engine against a real PostgreSQL database with Plaid
 * faked at the network boundary. Needs a scratch database that has been
 * migrated, so it only runs when TEST_DATABASE_URL is set:
 *
 *   TEST_DATABASE_URL=postgres://... pnpm test:db
 *
 * Every test wipes the tables, so never point this at a database you care about.
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";

const databaseUrl = process.env.TEST_DATABASE_URL;

type FakeItem = {
  accounts: Record<string, unknown>[];
  pages?: Record<string, unknown>[];
  holdings?: Record<string, unknown>[];
  securities?: Record<string, unknown>[];
  failWith?: string;
  delayMs?: number;
};

const fakeItems = new Map<string, FakeItem>();
const seenTokens = new Set<string>();
const originalFetch = globalThis.fetch;

function plaidError(code: string, status = 400) {
  return new Response(JSON.stringify({ error_code: code }), { status });
}

function fakePlaid(path: string, body: Record<string, unknown>): Response {
  const token = String(body.access_token);
  seenTokens.add(token);
  const item = fakeItems.get(token);
  if (!item) return plaidError("INVALID_ACCESS_TOKEN");
  if (item.failWith) return plaidError(item.failWith);

  if (path === "/accounts/balance/get" || path === "/accounts/get") {
    return Response.json({ accounts: item.accounts });
  }
  if (path === "/transactions/sync") {
    const pages = item.pages ?? [];
    const index = body.cursor ? Number(String(body.cursor).split("-")[1]) : 0;
    const page = pages[index] ?? {};
    return Response.json({
      added: [],
      modified: [],
      removed: [],
      has_more: index + 1 < pages.length,
      next_cursor: `cursor-${Math.min(index + 1, pages.length)}`,
      transactions_update_status: "HISTORICAL_UPDATE_COMPLETE",
      ...page,
    });
  }
  if (path === "/item/remove") return Response.json({ removed: true });
  if (path === "/investments/holdings/get") {
    return Response.json({
      holdings: item.holdings ?? [],
      securities: item.securities ?? [],
    });
  }
  return plaidError("UNEXPECTED_TEST_CALL", 500);
}

function account(id: string, overrides: Record<string, unknown> = {}) {
  return {
    account_id: id,
    name: `Account ${id}`,
    type: "depository",
    subtype: "checking",
    mask: "0000",
    balances: { current: 100, available: 90, iso_currency_code: "USD" },
    ...overrides,
  };
}

function plaidTransaction(id: string, accountId: string, amount: number) {
  return {
    transaction_id: id,
    account_id: accountId,
    date: "2026-11-01",
    name: `Purchase ${id}`,
    amount,
    pending: false,
  };
}

describe("sync engine", { skip: !databaseUrl }, () => {
  let engine: typeof import("@/lib/sync/engine");
  let db: ReturnType<typeof import("@/db/client").getDb>;
  let schema: typeof import("@/db/schema");
  let crypto: typeof import("@/lib/token-crypto");
  let drizzleSql: typeof import("drizzle-orm").sql;
  const secret = "a-test-secret-that-is-long-enough-for-this";

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.POSTGRES_URL = "";
    process.env.CRON_SECRET = secret;
    process.env.PLAID_CLIENT_ID = "test-client";
    process.env.PLAID_SECRET = "test-secret";
    process.env.PLAID_ENV = "sandbox";
    process.env.APP_TIMEZONE = "America/New_York";

    globalThis.fetch = (async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "sandbox.plaid.com");
      const body = JSON.parse(String(init?.body));
      const delayMs = fakeItems.get(String(body.access_token))?.delayMs ?? 0;
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      return fakePlaid(url.pathname, body);
    }) as typeof fetch;

    engine = await import("@/lib/sync/engine");
    schema = await import("@/db/schema");
    crypto = await import("@/lib/token-crypto");
    drizzleSql = (await import("drizzle-orm")).sql;
    db = (await import("@/db/client")).getDb();
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await db.$client.end();
  });

  beforeEach(async () => {
    fakeItems.clear();
    seenTokens.clear();
    await db.execute(drizzleSql`
      truncate public.plaid_items, public.accounts, public.merchant_rules, public.sync_states,
        public.sync_runs restart identity cascade
    `);
  });

  async function connect(itemId: string, token: string, item: FakeItem) {
    fakeItems.set(token, item);
    const [row] = await db
      .insert(schema.plaidItems)
      .values({
        itemId,
        institutionName: `Bank ${itemId}`,
        accessTokenEncrypted: crypto.encryptToken(token, secret, itemId),
      })
      .returning();
    return row;
  }

  async function count(table: string) {
    const rows = await db.execute(
      drizzleSql.raw(`select count(*)::int as n from public.${table}`),
    );
    return Number((rows[0] as { n: number }).n);
  }

  test("saves accounts and transactions with the app's sign convention", async () => {
    await connect("item-1", "token-1", {
      accounts: [
        account("a1"),
        account("c1", {
          type: "credit",
          subtype: "credit card",
          balances: { current: 250, available: 750 },
        }),
      ],
      pages: [
        { added: [plaidTransaction("t1", "a1", 12.5)] },
        { added: [plaidTransaction("t2", "c1", -40)] },
      ],
    });

    assert.deepEqual(await engine.runSync("manual"), {
      status: "success",
      connections: 1,
    });

    const balances = await db.execute(drizzleSql`
      select external_id, current_balance::float8 as balance
      from public.accounts order by external_id
    `);
    assert.deepEqual(
      balances.map((row) => [row.external_id, row.balance]),
      [
        ["a1", 100],
        ["c1", -250],
      ],
    );

    const amounts = await db.execute(drizzleSql`
      select external_id, amount::float8 as amount
      from public.transactions order by external_id
    `);
    assert.deepEqual(
      amounts.map((row) => [row.external_id, row.amount]),
      [
        ["t1", -12.5],
        ["t2", 40],
      ],
    );
    assert.equal(await count("balance_snapshots"), 2);
  });

  test("stores tokens encrypted and decrypts them only to call Plaid", async () => {
    await connect("item-1", "plain-token-value", { accounts: [account("a1")] });
    await engine.runSync("manual");

    assert.ok(seenTokens.has("plain-token-value"));
    const rows = await db.execute(drizzleSql`
      select access_token_encrypted from public.plaid_items
    `);
    assert.doesNotMatch(
      String(rows[0].access_token_encrypted),
      /plain-token-value/,
    );
  });

  test("one bank's expired login does not stop the others", async () => {
    await connect("item-bad", "token-bad", {
      accounts: [],
      failWith: "ITEM_LOGIN_REQUIRED",
    });
    await connect("item-good", "token-good", {
      accounts: [account("a1")],
      pages: [{ added: [plaidTransaction("t1", "a1", 5)] }],
    });

    assert.deepEqual(await engine.runSync("scheduled"), {
      status: "partial",
      connections: 2,
      failed: 1,
    });
    assert.equal(await count("transactions"), 1);

    const items = await db.execute(drizzleSql`
      select item_id, status::text, last_error_code, last_error_message, cursor
      from public.plaid_items order by item_id
    `);
    assert.equal(items[0].status, "login_required");
    assert.equal(items[0].last_error_code, "ITEM_LOGIN_REQUIRED");
    assert.match(String(items[0].last_error_message), /sign in again/);
    assert.equal(items[0].cursor, null);
    assert.equal(items[1].status, "active");
    assert.equal(items[1].cursor, "cursor-1");
  });

  test("a failed write rolls back and leaves the cursor unmoved", async () => {
    await connect("item-1", "token-1", {
      accounts: [account("a1")],
      pages: [
        {
          added: [
            plaidTransaction("t1", "a1", 5),
            { ...plaidTransaction("t2", "a1", 6), date: "not-a-date" },
          ],
        },
      ],
    });

    const outcome = await engine.runSync("manual");
    assert.equal(outcome.status, "failed");
    assert.equal(await count("transactions"), 0);
    assert.equal(await count("accounts"), 0);

    const [item] = await db.select().from(schema.plaidItems);
    assert.equal(item.cursor, null);
    assert.equal(item.status, "error");

    // Once the bad record is gone, the same changes are picked up in full.
    fakeItems.get("token-1")!.pages = [
      { added: [plaidTransaction("t1", "a1", 5)] },
    ];
    assert.equal((await engine.runSync("manual")).status, "success");
    assert.equal(await count("transactions"), 1);
  });

  test("handles a transaction added, changed, and removed in one batch", async () => {
    await connect("item-1", "token-1", {
      accounts: [account("a1")],
      pages: [
        {
          added: [
            plaidTransaction("t1", "a1", 5),
            plaidTransaction("t2", "a1", 9),
          ],
        },
        {
          modified: [plaidTransaction("t1", "a1", 7)],
          removed: [{ transaction_id: "t2" }],
        },
      ],
    });

    await engine.runSync("manual");
    const rows = await db.execute(drizzleSql`
      select external_id, amount::float8 as amount from public.transactions
    `);
    assert.deepEqual(
      rows.map((row) => [row.external_id, row.amount]),
      [["t1", -7]],
    );
  });

  test("applies changes that arrive on a later run", async () => {
    await connect("item-1", "token-1", {
      accounts: [account("a1")],
      pages: [{ added: [plaidTransaction("t1", "a1", 5)] }],
    });
    await engine.runSync("manual");

    fakeItems.get("token-1")!.pages = [
      {},
      { modified: [plaidTransaction("t1", "a1", 8)] },
    ];
    await engine.runSync("manual");

    const [row] = await db.select().from(schema.transactions);
    assert.equal(Number(row.amount), -8);
    const [item] = await db.select().from(schema.plaidItems);
    assert.equal(item.cursor, "cursor-2");
  });

  test("a category the owner picked survives the next sync", async () => {
    await connect("item-1", "token-1", {
      accounts: [account("a1")],
      pages: [{ added: [plaidTransaction("t1", "a1", 5)] }],
    });
    await engine.runSync("manual");
    await db.execute(drizzleSql`
      update public.transactions
      set category_primary = 'TRAVEL', category_detailed = null, category_locked = true
    `);

    fakeItems.get("token-1")!.pages = [
      {},
      { modified: [plaidTransaction("t1", "a1", 8)] },
    ];
    await engine.runSync("manual");

    const [row] = await db.select().from(schema.transactions);
    assert.equal(row.categoryPrimary, "TRAVEL");
    assert.equal(row.categoryDetailed, null);
    assert.equal(Number(row.amount), -8);
  });

  test("a transaction left out of totals stays left out after a sync", async () => {
    await connect("item-1", "token-1", {
      accounts: [account("a1")],
      pages: [{ added: [plaidTransaction("t1", "a1", 5)] }],
    });
    await engine.runSync("manual");
    await db.execute(drizzleSql`update public.transactions set ignored = true`);

    fakeItems.get("token-1")!.pages = [
      {},
      { modified: [plaidTransaction("t1", "a1", 8)] },
    ];
    await engine.runSync("manual");

    const [row] = await db.select().from(schema.transactions);
    assert.equal(row.ignored, true);
  });

  test("a merchant rule files new charges as they arrive", async () => {
    const merchantName = "Rule Merchant";
    await db.insert(schema.merchantRules).values({
      merchant: merchantName,
      categoryPrimary: "TRAVEL",
    });
    await connect("item-1", "token-1", {
      accounts: [account("a1")],
      pages: [
        {
          added: [
            { ...plaidTransaction("t1", "a1", 5), merchant_name: merchantName },
            plaidTransaction("t2", "a1", 7),
          ],
        },
      ],
    });
    await engine.runSync("manual");

    const rows = await db.select().from(schema.transactions);
    const ruled = rows.find((row) => row.externalId === "t1");
    const other = rows.find((row) => row.externalId === "t2");
    assert.equal(ruled?.categoryPrimary, "TRAVEL");
    assert.equal(ruled?.categoryLocked, true);
    assert.notEqual(other?.categoryPrimary, "TRAVEL");
  });

  test("runs at most once a day on schedule, but a person can still refresh", async () => {
    await connect("item-1", "token-1", { accounts: [account("a1")] });

    assert.equal((await engine.runSync("scheduled")).status, "success");
    assert.deepEqual(await engine.runSync("scheduled"), {
      status: "skipped",
      reason: "already-synced-today",
    });
    assert.equal((await engine.runSync("manual")).status, "success");
  });

  test("overlapping runs can't both start, and a crashed lock is taken over", async () => {
    await connect("item-1", "token-1", { accounts: [account("a1")] });
    await db.execute(drizzleSql`
      insert into public.sync_states (source, status, last_attempt_at)
      values ('plaid', 'running', now())
    `);
    assert.deepEqual(await engine.runSync("manual"), {
      status: "skipped",
      reason: "already-running",
    });

    await db.execute(drizzleSql`
      update public.sync_states
      set last_attempt_at = now() - interval '11 minutes'
    `);
    assert.equal((await engine.runSync("manual")).status, "success");
  });

  test("only one of two simultaneous runs does the work", async () => {
    await connect("item-1", "token-1", {
      accounts: [account("a1")],
      delayMs: 40,
    });
    const outcomes = await Promise.all([
      engine.runSync("manual"),
      engine.runSync("manual"),
    ]);
    assert.deepEqual(outcomes.map((outcome) => outcome.status).sort(), [
      "skipped",
      "success",
    ]);
  });

  test("an account closed at the bank stops counting", async () => {
    const accountsNow = [account("a1"), account("a2")];
    await connect("item-1", "token-1", { accounts: accountsNow });
    await engine.runSync("manual");

    fakeItems.get("token-1")!.accounts = [account("a1")];
    await engine.runSync("manual");

    const rows = await db.execute(drizzleSql`
      select external_id, connected from public.accounts order by external_id
    `);
    assert.deepEqual(
      rows.map((row) => [row.external_id, row.connected]),
      [
        ["a1", true],
        ["a2", false],
      ],
    );
  });

  test("tracks holdings, keeps unknown cost basis unknown, and drops sold positions", async () => {
    const investment = account("i1", {
      type: "investment",
      subtype: "brokerage",
      balances: { current: 2000 },
    });
    await connect("item-1", "token-1", {
      accounts: [investment],
      securities: [
        { security_id: "s1", name: "Index Fund", ticker_symbol: "VTI", type: "etf" },
        { security_id: "s2", name: "Mystery Co", ticker_symbol: "MYS", type: "equity" },
        {
          security_id: "s3",
          name: "US Dollar",
          ticker_symbol: "CUR:USD",
          type: "cash",
          is_cash_equivalent: true,
        },
      ],
      holdings: [
        {
          account_id: "i1",
          security_id: "s1",
          quantity: 4,
          institution_price: 250,
          institution_value: 1000,
          cost_basis: 800,
        },
        {
          account_id: "i1",
          security_id: "s2",
          quantity: 10,
          institution_price: 90,
          institution_value: 900,
          cost_basis: null,
        },
        {
          account_id: "i1",
          security_id: "s3",
          quantity: 100,
          institution_price: 1,
          institution_value: 100,
        },
      ],
    });

    await engine.runSync("manual");
    const rows = await db.execute(drizzleSql`
      select
        symbol,
        asset_type,
        current_value::float8 as value,
        cost_basis::float8 as basis,
        unrealized_gain::float8 as gain
      from public.holdings
      order by symbol
    `);
    assert.deepEqual(
      rows.map((row) => [row.symbol, row.asset_type, row.value, row.basis, row.gain]),
      [
        ["MYS", "equity", 900, null, null],
        ["USD", "cash", 100, 100, 0],
        ["VTI", "etf", 1000, 800, 200],
      ],
    );
    const [snapshot] = await db.select().from(schema.investmentSnapshots);
    assert.equal(Number(snapshot.marketValue), 2000);
    assert.equal(Number(snapshot.unrealizedGain), 200);

    fakeItems.get("token-1")!.holdings = [
      {
        account_id: "i1",
        security_id: "s1",
        quantity: 4,
        institution_price: 250,
        institution_value: 1000,
        cost_basis: 800,
      },
    ];
    await engine.runSync("manual");
    assert.equal(await count("holdings"), 1);
  });

  test("explains a changed CRON_SECRET instead of promising to retry", async () => {
    await connect("item-1", "token-1", { accounts: [account("a1")] });
    await db.execute(drizzleSql`
      update public.plaid_items
      set access_token_encrypted = ${crypto.encryptToken(
        "token-1",
        "a-different-secret-that-is-also-long-enough",
        "item-1",
      )}
    `);

    assert.equal((await engine.runSync("manual")).status, "failed");
    const [item] = await db.select().from(schema.plaidItems);
    assert.equal(item.lastErrorCode, "TOKEN_UNREADABLE");
    assert.match(String(item.lastErrorMessage), /CRON_SECRET changed/);
  });

  test("a connection with an unreadable token can still be removed", async () => {
    const connections = await import("@/lib/connections");
    await connect("item-1", "token-1", { accounts: [account("a1")] });
    await engine.runSync("manual");
    const [item] = await db
      .update(schema.plaidItems)
      .set({ accessTokenEncrypted: "v1.not.really.encrypted" })
      .returning();

    // False tells the owner that Plaid itself still has to be revoked.
    assert.equal(await connections.disconnectItem(item), false);

    assert.equal(await count("plaid_items"), 0);
    const [row] = await db.select().from(schema.accounts);
    assert.equal(row.connected, false);
  });

  test("removing a connection keeps its history but stops counting it", async () => {
    const connections = await import("@/lib/connections");
    const item = await connect("item-1", "token-1", {
      accounts: [account("a1")],
      pages: [{ added: [plaidTransaction("t1", "a1", 5)] }],
    });
    await engine.runSync("manual");
    assert.equal(await connections.disconnectItem(item), true);

    assert.equal(await count("plaid_items"), 0);
    assert.equal(await count("transactions"), 1);
    const [row] = await db.select().from(schema.accounts);
    assert.equal(row.connected, false);
  });

  test("does nothing when there is nothing connected", async () => {
    assert.deepEqual(await engine.runSync("scheduled"), {
      status: "skipped",
      reason: "no-connections",
    });
  });

  test("a brand-new connection is imported on its own", async () => {
    const item = await connect("item-1", "token-1", {
      accounts: [account("a1")],
      pages: [{ added: [plaidTransaction("t1", "a1", 5)] }],
    });
    await engine.syncSingleItem(item.id);

    assert.equal(await count("transactions"), 1);
    const [row] = await db.select().from(schema.plaidItems);
    assert.ok(row.lastSuccessAt);
  });
});
