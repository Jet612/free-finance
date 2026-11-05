import { PlaidApiError } from "@/lib/plaid/client";
import { TokenUnreadableError } from "@/lib/token-crypto";

export type FriendlyPlaidError = {
  code: string;
  message: string;
  needsReconnect: boolean;
};

const RECONNECT_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "ITEM_LOCKED",
  "ITEM_NOT_SUPPORTED",
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
  "INVALID_SEND_METHOD",
  "INVALID_UPDATED_USERNAME",
  "USER_SETUP_REQUIRED",
  "USER_INPUT_TIMEOUT",
  "MFA_NOT_SUPPORTED",
  "NO_ACCOUNTS",
  "ACCESS_NOT_GRANTED",
  "USER_PERMISSION_REVOKED",
  "INVALID_ACCESS_TOKEN",
  "ITEM_NOT_FOUND",
]);

const TEMPORARY_CODES = new Set([
  "INSTITUTION_DOWN",
  "INSTITUTION_NOT_RESPONDING",
  "INSTITUTION_NOT_AVAILABLE",
  "INTERNAL_SERVER_ERROR",
  "PLANNED_MAINTENANCE",
  "RATE_LIMIT_EXCEEDED",
  "TRANSACTIONS_LIMIT",
  "TRANSACTIONS_SYNC_LIMIT",
  "ACCOUNTS_LIMIT",
  "BALANCE_LIMIT",
  "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
]);

const KEY_CODES = new Set([
  "INVALID_API_KEYS",
  "INVALID_SECRET",
  "INVALID_CLIENT_ID",
  "UNAUTHORIZED_ENVIRONMENT",
  "UNAUTHORIZED_ROUTE_ACCESS",
]);

/**
 * Turns a failure into a sentence the owner can act on. Raw provider responses
 * never reach the database or the logs, so nothing sensitive can leak through
 * an error message.
 */
export function describePlaidError(
  error: unknown,
  institution: string,
): FriendlyPlaidError {
  if (error instanceof TokenUnreadableError) {
    return {
      code: "TOKEN_UNREADABLE",
      needsReconnect: false,
      message: `${institution} can't update because CRON_SECRET changed. Put the old value back in Vercel, or remove this connection and add it again.`,
    };
  }
  const code = error instanceof PlaidApiError ? error.code : "SYNC_ERROR";
  if (RECONNECT_CODES.has(code)) {
    return {
      code,
      needsReconnect: true,
      message: `${institution} needs you to sign in again. Choose Reconnect to fix it.`,
    };
  }
  if (TEMPORARY_CODES.has(code)) {
    return {
      code,
      needsReconnect: false,
      message: `${institution} is having a temporary problem. It will try again at the next update.`,
    };
  }
  if (KEY_CODES.has(code)) {
    return {
      code,
      needsReconnect: false,
      message:
        "Plaid rejected your keys. Check PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV in your Vercel project.",
    };
  }
  return {
    code,
    needsReconnect: false,
    message: `${institution} couldn't be updated. It will try again at the next update.`,
  };
}
