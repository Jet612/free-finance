import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { PlaidConfig } from "@/lib/app-config";

import {
  fetchAccounts,
  fetchHoldings,
  fetchTransactionChanges,
  findPublicTokens,
  PlaidApiError,
} from "./client";
import { describePlaidError } from "./errors";

const config: PlaidConfig = {
  clientId: "client",
  secret: "plaid-secret-value",
  environment: "sandbox",
  baseUrl: "https://sandbox.plaid.com",
  countryCodes: ["US"],
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function respondWith(
  handler: (path: string, body: Record<string, unknown>) => Response,
) {
  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push(path);
    return handler(path, JSON.parse(String(init?.body)));
  }) as typeof fetch;
  return calls;
}

function failure(code: string, status = 400) {
  return new Response(JSON.stringify({ error_code: code }), { status });
}

const page = {
  added: [],
  modified: [],
  removed: [],
  next_cursor: "next",
  has_more: false,
};

test("falls back to cached balances when live ones aren't available", async () => {
  const account = {
    account_id: "a1",
    name: "Brokerage",
    type: "investment",
    balances: { current: 10 },
  };
  const calls = respondWith((path) =>
    path === "/accounts/balance/get"
      ? failure("PRODUCTS_NOT_SUPPORTED")
      : Response.json({ accounts: [account] }),
  );
  assert.equal((await fetchAccounts(config, "t")).length, 1);
  assert.deepEqual(calls, ["/accounts/balance/get", "/accounts/get"]);
});

test("reports the real problem when both balance calls fail", async () => {
  respondWith(() => failure("ITEM_LOGIN_REQUIRED"));
  await assert.rejects(
    fetchAccounts(config, "t"),
    (error: PlaidApiError) => error.code === "ITEM_LOGIN_REQUIRED",
  );
});

test("retries once after a server error", async () => {
  let attempts = 0;
  respondWith(() => {
    attempts += 1;
    return attempts === 1
      ? failure("INTERNAL_SERVER_ERROR", 500)
      : Response.json(page);
  });
  const changes = await fetchTransactionChanges(config, "t", null);
  assert.equal(changes.nextCursor, "next");
  assert.equal(attempts, 2);
});

test("restarts from the original cursor if Plaid's data shifts mid-pagination", async () => {
  const cursors: unknown[] = [];
  let call = 0;
  respondWith((_path, body) => {
    cursors.push(body.cursor);
    call += 1;
    if (call === 1) {
      return Response.json({ ...page, has_more: true, next_cursor: "page-2" });
    }
    if (call === 2) {
      return failure("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION");
    }
    return Response.json(page);
  });
  await fetchTransactionChanges(config, "t", "start");
  assert.deepEqual(cursors, ["start", "page-2", "start"]);
});

test("no investments is an answer, not a failure", async () => {
  respondWith(() => failure("NO_INVESTMENT_ACCOUNTS"));
  assert.equal(await fetchHoldings(config, "t"), null);
});

test("a real holdings failure still surfaces", async () => {
  respondWith(() => failure("ITEM_LOGIN_REQUIRED"));
  await assert.rejects(fetchHoldings(config, "t"));
});

test("finds public tokens wherever Plaid nests them", () => {
  assert.deepEqual(
    findPublicTokens({
      link_sessions: [
        {
          on_success: { public_token: "public-a" },
          results: {
            item_add_results: [
              { public_token: "public-a" },
              { public_token: "public-b" },
            ],
          },
        },
      ],
      other: { public_tokens: ["public-c", "not-a-token"] },
    }),
    ["public-a", "public-b", "public-c"],
  );
  assert.deepEqual(findPublicTokens({ link_sessions: [] }), []);
});

test("errors never carry the secret or token", async () => {
  respondWith(() => failure("ITEM_LOGIN_REQUIRED"));
  await assert.rejects(fetchHoldings(config, "access-secret"), (error: Error) => {
    assert.doesNotMatch(String(error), /plaid-secret-value|access-secret/);
    return true;
  });
});

test("explains problems in plain English", () => {
  const reconnect = describePlaidError(
    new PlaidApiError("ITEM_LOGIN_REQUIRED", 400),
    "Chase",
  );
  assert.equal(reconnect.needsReconnect, true);
  assert.match(reconnect.message, /Chase needs you to sign in again/);

  const outage = describePlaidError(
    new PlaidApiError("INSTITUTION_DOWN", 400),
    "Chase",
  );
  assert.equal(outage.needsReconnect, false);
  assert.match(outage.message, /temporary problem/);

  assert.match(
    describePlaidError(new PlaidApiError("INVALID_API_KEYS", 400), "Chase")
      .message,
    /PLAID_SECRET/,
  );
});

test("an unexpected error reveals nothing about its cause", () => {
  const friendly = describePlaidError(
    new Error("connection to postgres://user:password@host failed"),
    "Chase",
  );
  assert.equal(friendly.code, "SYNC_ERROR");
  assert.doesNotMatch(friendly.message, /postgres|password/);
});
