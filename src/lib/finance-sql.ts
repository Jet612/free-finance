import { sql } from "drizzle-orm";

/**
 * The one definition of income and spending, shared by every page so they can
 * never disagree. Fragments reference `public.transactions` columns unqualified.
 *
 * Moving money between your own accounts isn't income or spending. That covers
 * transfers, and credit card payments: the purchases were already counted when
 * they were made, so counting the payment too would double them.
 */
export const COUNTS_AS_CASH_FLOW = sql.raw(`(
  pending = false
  and coalesce(category_primary, '') not in ('TRANSFER_IN', 'TRANSFER_OUT')
  and coalesce(category_detailed, '') <> 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'
)`);

/**
 * Money in that Plaid calls income, or couldn't categorize. Any other money in
 * is a refund, which reduces spending rather than posing as a raise.
 */
export const IS_INCOME = sql.raw(`(
  amount > 0 and coalesce(category_primary, 'INCOME') = 'INCOME'
)`);

export const INCOME_TOTAL = sql`
  coalesce(sum(amount) filter (where ${IS_INCOME}), 0)::float8
`;

/** Refunds can outweigh purchases in a quiet month, but spending can't go below zero. */
export const SPENDING_TOTAL = sql`
  greatest(coalesce(-sum(amount) filter (where not ${IS_INCOME}), 0), 0)::float8
`;
