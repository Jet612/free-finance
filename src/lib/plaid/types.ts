import { z } from "zod";

/**
 * Only the fields the app relies on are validated. Plaid adds fields often, so
 * everything else passes through untouched and lands in `raw_data`.
 */
const plaidBalances = z.looseObject({
  current: z.number().nullish(),
  available: z.number().nullish(),
  iso_currency_code: z.string().nullish(),
  unofficial_currency_code: z.string().nullish(),
});

export const plaidAccountSchema = z.looseObject({
  account_id: z.string().min(1),
  name: z.string(),
  official_name: z.string().nullish(),
  type: z.string(),
  subtype: z.string().nullish(),
  mask: z.string().nullish(),
  balances: plaidBalances,
});

export const plaidAccountsResponseSchema = z.looseObject({
  accounts: z.array(plaidAccountSchema),
});

export const plaidTransactionSchema = z.looseObject({
  transaction_id: z.string().min(1),
  account_id: z.string().min(1),
  date: z.string().min(1),
  authorized_date: z.string().nullish(),
  authorized_datetime: z.string().nullish(),
  datetime: z.string().nullish(),
  name: z.string().nullish(),
  merchant_name: z.string().nullish(),
  original_description: z.string().nullish(),
  amount: z.number(),
  personal_finance_category: z
    .looseObject({
      primary: z.string().nullish(),
      detailed: z.string().nullish(),
    })
    .nullish(),
  pending: z.boolean(),
  payment_channel: z.string().nullish(),
  iso_currency_code: z.string().nullish(),
  unofficial_currency_code: z.string().nullish(),
  logo_url: z.string().nullish(),
  website: z.string().nullish(),
});

export const plaidTransactionsSyncSchema = z.looseObject({
  added: z.array(plaidTransactionSchema),
  modified: z.array(plaidTransactionSchema),
  removed: z.array(z.looseObject({ transaction_id: z.string().nullish() })),
  next_cursor: z.string(),
  has_more: z.boolean(),
  transactions_update_status: z.string().nullish(),
});

export const plaidHoldingSchema = z.looseObject({
  account_id: z.string().min(1),
  security_id: z.string().min(1),
  quantity: z.number(),
  institution_price: z.number().nullish(),
  institution_value: z.number().nullish(),
  cost_basis: z.number().nullish(),
});

export const plaidSecuritySchema = z.looseObject({
  security_id: z.string().min(1),
  name: z.string().nullish(),
  ticker_symbol: z.string().nullish(),
  type: z.string().nullish(),
  is_cash_equivalent: z.boolean().nullish(),
});

export const plaidHoldingsResponseSchema = z.looseObject({
  holdings: z.array(plaidHoldingSchema),
  securities: z.array(plaidSecuritySchema),
});

export const plaidItemResponseSchema = z.looseObject({
  item: z.looseObject({
    item_id: z.string().min(1),
    institution_id: z.string().nullish(),
    institution_name: z.string().nullish(),
    billed_products: z.array(z.string()).nullish(),
    products: z.array(z.string()).nullish(),
    consented_products: z.array(z.string()).nullish(),
  }),
});

export type PlaidAccount = z.infer<typeof plaidAccountSchema>;
export type PlaidTransaction = z.infer<typeof plaidTransactionSchema>;
export type PlaidHolding = z.infer<typeof plaidHoldingSchema>;
export type PlaidSecurity = z.infer<typeof plaidSecuritySchema>;
