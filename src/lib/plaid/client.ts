import type { z } from "zod";

import type { PlaidConfig } from "@/lib/app-config";
import {
  plaidAccountsResponseSchema,
  plaidHoldingsResponseSchema,
  plaidItemResponseSchema,
  plaidTransactionsSyncSchema,
  type PlaidAccount,
  type PlaidHolding,
  type PlaidSecurity,
  type PlaidTransaction,
} from "@/lib/plaid/types";

const API_VERSION = "2020-09-14";
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 1_500;

/** Carries only Plaid's error code and status, never request or token data. */
export class PlaidApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly requestId: string | null = null,
  ) {
    super(`Plaid request failed with ${code}.`);
    this.name = "PlaidApiError";
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof PlaidApiError) {
    return error.status === 429 || error.status >= 500;
  }
  return true;
}

async function postOnce(
  config: PlaidConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Plaid-Version": API_VERSION,
      "PLAID-CLIENT-ID": config.clientId,
      "PLAID-SECRET": config.secret,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => null)) as {
    error_code?: unknown;
    request_id?: unknown;
  } | null;
  if (!response.ok) {
    throw new PlaidApiError(
      typeof payload?.error_code === "string"
        ? payload.error_code
        : "UNKNOWN_PLAID_ERROR",
      response.status,
      typeof payload?.request_id === "string" ? payload.request_id : null,
    );
  }
  return payload;
}

/**
 * The daily sync gets one chance per day, so a brief outage is worth one retry.
 * Calls that change state on Plaid's side opt out with `retry: false`.
 */
async function post(
  config: PlaidConfig,
  path: string,
  body: Record<string, unknown>,
  { retry = true }: { retry?: boolean } = {},
): Promise<unknown> {
  try {
    return await postOnce(config, path, body);
  } catch (error) {
    if (!retry || !shouldRetry(error)) throw error;
    await pause(RETRY_DELAY_MS);
    return postOnce(config, path, body);
  }
}

async function postParsed<Schema extends z.ZodType>(
  config: PlaidConfig,
  path: string,
  body: Record<string, unknown>,
  schema: Schema,
): Promise<z.output<Schema>> {
  return schema.parse(await post(config, path, body));
}

/**
 * Prefers a live balance, but a cached one still beats failing the whole bank:
 * some institutions and account types can't answer real-time balance requests.
 */
export async function fetchAccounts(
  config: PlaidConfig,
  accessToken: string,
): Promise<PlaidAccount[]> {
  try {
    const live = await postParsed(
      config,
      "/accounts/balance/get",
      { access_token: accessToken },
      plaidAccountsResponseSchema,
    );
    return live.accounts;
  } catch {
    // A real connection problem fails here too, with the error worth reporting.
    return fetchCachedAccounts(config, accessToken);
  }
}

/** No per-call cost, which suits a quick look at a brand-new connection. */
export async function fetchCachedAccounts(
  config: PlaidConfig,
  accessToken: string,
): Promise<PlaidAccount[]> {
  const result = await postParsed(
    config,
    "/accounts/get",
    { access_token: accessToken },
    plaidAccountsResponseSchema,
  );
  return result.accounts;
}

export type TransactionChanges = {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removedIds: string[];
  nextCursor: string;
};

const FIRST_PULL_ATTEMPTS = 12;
const FIRST_PULL_DELAY_MS = 4_000;

/**
 * Collects every page before anything is written, so a cursor only ever moves
 * past changes that were all saved. A brand-new connection needs a moment before
 * Plaid has transactions, which `waitForFirstPull` rides out.
 */
export async function fetchTransactionChanges(
  config: PlaidConfig,
  accessToken: string,
  startingCursor: string | null,
  { waitForFirstPull = false }: { waitForFirstPull?: boolean } = {},
): Promise<TransactionChanges> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let cursor = startingCursor;
    const added: PlaidTransaction[] = [];
    const modified: PlaidTransaction[] = [];
    const removedIds: string[] = [];
    let waits = 0;

    try {
      while (true) {
        const page = await postParsed(
          config,
          "/transactions/sync",
          {
            access_token: accessToken,
            count: 500,
            options: { include_original_description: true },
            ...(cursor ? { cursor } : {}),
          },
          plaidTransactionsSyncSchema,
        );
        if (
          waitForFirstPull &&
          !cursor &&
          page.transactions_update_status === "NOT_READY" &&
          waits < FIRST_PULL_ATTEMPTS
        ) {
          waits += 1;
          await pause(FIRST_PULL_DELAY_MS);
          continue;
        }
        added.push(...page.added);
        modified.push(...page.modified);
        for (const removed of page.removed) {
          if (removed.transaction_id) removedIds.push(removed.transaction_id);
        }
        cursor = page.next_cursor;
        if (!page.has_more) {
          return { added, modified, removedIds, nextCursor: cursor };
        }
      }
    } catch (error) {
      const restartable =
        error instanceof PlaidApiError &&
        error.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" &&
        attempt === 0;
      if (!restartable) throw error;
    }
  }
  throw new PlaidApiError("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION", 400);
}

export type HoldingsResult = {
  holdings: PlaidHolding[];
  securities: PlaidSecurity[];
};

/** These mean "this connection has no investments", not "something broke". */
const NO_HOLDINGS_CODES = new Set([
  "NO_INVESTMENT_ACCOUNTS",
  "NO_INVESTMENT_AUTH_ACCOUNTS",
  "PRODUCTS_NOT_SUPPORTED",
  "PRODUCT_NOT_ENABLED",
  "PRODUCT_NOT_READY",
  "ADDITIONAL_CONSENT_REQUIRED",
  "INVALID_PRODUCT",
]);

export async function fetchHoldings(
  config: PlaidConfig,
  accessToken: string,
): Promise<HoldingsResult | null> {
  try {
    return await postParsed(
      config,
      "/investments/holdings/get",
      { access_token: accessToken },
      plaidHoldingsResponseSchema,
    );
  } catch (error) {
    if (error instanceof PlaidApiError && NO_HOLDINGS_CODES.has(error.code)) {
      return null;
    }
    throw error;
  }
}

export type ItemDetails = {
  itemId: string;
  institutionId: string | null;
  institutionName: string;
};

export async function fetchItemDetails(
  config: PlaidConfig,
  accessToken: string,
): Promise<ItemDetails> {
  const { item } = await postParsed(
    config,
    "/item/get",
    { access_token: accessToken },
    plaidItemResponseSchema,
  );
  const institutionId = item.institution_id ?? null;
  let institutionName = item.institution_name ?? null;
  if (!institutionName && institutionId) {
    // A missing label must not stop a connection from being saved.
    institutionName = await post(config, "/institutions/get_by_id", {
      institution_id: institutionId,
      country_codes: config.countryCodes,
    })
      .then(
        (result) =>
          (result as { institution?: { name?: string } }).institution?.name ??
          null,
      )
      .catch(() => null);
  }
  return {
    itemId: item.item_id,
    institutionId,
    institutionName: institutionName ?? "Your bank",
  };
}

export type ConnectionKind = "bank" | "investment";

export type LinkTarget =
  | { mode: "new"; kind: ConnectionKind }
  | { mode: "update"; accessToken: string };

/** `products` must all be supported, so each kind lists its anchor first. */
function linkProducts(kind: ConnectionKind) {
  return kind === "investment"
    ? { products: ["investments"], optional_products: ["transactions"] }
    : { products: ["transactions"], optional_products: ["investments"] };
}

export async function createHostedLink(
  config: PlaidConfig,
  target: LinkTarget,
  redirectUri: string,
  appName: string,
): Promise<{ linkToken: string; url: string }> {
  const result = (await post(
    config,
    "/link/token/create",
    {
      client_name: appName.slice(0, 30),
      language: "en",
      country_codes: config.countryCodes,
      user: { client_user_id: "free-finance-owner" },
      hosted_link: {
        completion_redirect_uri: redirectUri,
        url_lifetime_seconds: 1800,
      },
      ...(target.mode === "update"
        ? { access_token: target.accessToken }
        : {
            ...linkProducts(target.kind),
            transactions: { days_requested: 730 },
          }),
    },
    { retry: false },
  )) as { link_token?: unknown; hosted_link_url?: unknown };
  if (
    typeof result.link_token !== "string" ||
    typeof result.hosted_link_url !== "string"
  ) {
    throw new PlaidApiError("MISSING_HOSTED_LINK_URL", 502);
  }
  return { linkToken: result.link_token, url: result.hosted_link_url };
}

/** Plaid nests results by session type, so search rather than hard-code a path. */
export function findPublicTokens(value: unknown): string[] {
  const found: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
    } else if (node && typeof node === "object") {
      for (const [key, item] of Object.entries(node)) {
        if (key === "public_token" || key === "public_tokens") {
          for (const token of Array.isArray(item) ? item : [item]) {
            if (typeof token === "string" && token.startsWith("public-")) {
              found.push(token);
            }
          }
        } else {
          visit(item);
        }
      }
    }
  };
  visit(value);
  return Array.from(new Set(found));
}

const LINK_RESULT_ATTEMPTS = 6;
const LINK_RESULT_DELAY_MS = 1_500;

/** Hosted Link publishes results a moment after sending the person back. */
export async function fetchLinkPublicTokens(
  config: PlaidConfig,
  linkToken: string,
): Promise<string[]> {
  for (let attempt = 0; attempt < LINK_RESULT_ATTEMPTS; attempt += 1) {
    const session = await post(config, "/link/token/get", {
      link_token: linkToken,
    });
    const tokens = findPublicTokens(session);
    if (tokens.length) return tokens;
    await pause(LINK_RESULT_DELAY_MS);
  }
  return [];
}

export async function exchangePublicToken(
  config: PlaidConfig,
  publicToken: string,
): Promise<string> {
  const result = (await post(
    config,
    "/item/public_token/exchange",
    { public_token: publicToken },
    { retry: false },
  )) as { access_token?: unknown };
  if (typeof result.access_token !== "string") {
    throw new PlaidApiError("MISSING_ACCESS_TOKEN", 502);
  }
  return result.access_token;
}

/** Ends Plaid's access, and its billing, for this connection. */
export async function removeItem(
  config: PlaidConfig,
  accessToken: string,
): Promise<void> {
  await post(
    config,
    "/item/remove",
    { access_token: accessToken },
    { retry: false },
  );
}
