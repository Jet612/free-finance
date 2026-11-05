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
  and ignored = false
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

/**
 * Each account's latest known balance on each day, for up to a year. A day an
 * account couldn't update repeats its last value, instead of the whole account
 * vanishing and showing as a fake drop in net worth.
 */
export function netWorthTrendCtes(today: string) {
  return sql`
    trend_days as (
      select generate_series(
        greatest(
          (select min(snapshot_date) from public.balance_snapshots),
          ${today}::date - 365
        ),
        ${today}::date,
        interval '1 day'
      )::date as day
    ),
    trend_rows as (
      select trend_days.day::text as date, sum(known.balance)::float8 as value
      from trend_days
      cross join public.accounts
      cross join lateral (
        select balance
        from public.balance_snapshots
        where account_id = accounts.id
          and snapshot_date <= trend_days.day
        order by snapshot_date desc
        limit 1
      ) known
      where accounts.connected = true
        and accounts.in_net_worth = true
      group by trend_days.day
    ),
    trend as (
      select coalesce(
        jsonb_agg(jsonb_build_object('date', date, 'value', value) order by date),
        '[]'::jsonb
      ) as data
      from trend_rows
    )
  `;
}
