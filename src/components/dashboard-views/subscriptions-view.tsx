import type { ReactNode } from "react";
import Link from "next/link";

import { MerchantIcon } from "@/components/merchant-icon";
import { Money } from "@/components/money";
import { EmptyNote, PageHeader, Panel, SectionHeading } from "@/components/page-header";
import { categoryLabel } from "@/lib/categories";
import type { SubscriptionsData } from "@/lib/detail-data";
import { formatShortDate, plural } from "@/lib/format";
import type { RecurringBill, SubscriptionInsight } from "@/lib/subscription-detection";

function PriceChange({ item }: { item: SubscriptionInsight }) {
  if (item.previousAmount === null) return null;
  const change = item.averageAmount - item.previousAmount;
  return (
    <span className={change > 0 ? "font-medium text-warning" : "font-medium text-positive"}>
      {change > 0 ? "Up" : "Down"} <Money value={Math.abs(change)} /> from <Money value={item.previousAmount} />
    </span>
  );
}

/** One line for anything recurring: what it is, when it's next, what it costs. */
function RecurringRow({
  merchant,
  category,
  detail,
  next,
  amount,
  note,
  href,
  action,
}: {
  merchant: string;
  category: string | null;
  detail: ReactNode;
  next: string;
  amount: number;
  note?: string;
  href: string;
  action: ReactNode;
}) {
  return (
    <li className="group/row flex items-center gap-1 pr-2 transition-colors hover:bg-accent/50">
      <Link
        href={href}
        className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-3 pl-4 outline-offset-[-2px] sm:grid-cols-[auto_minmax(0,1fr)_6rem_6rem]"
      >
        <MerchantIcon category={category} />
        <span className="min-w-0">
          <span className="block truncate text-[0.9375rem] font-medium leading-snug">{merchant}</span>
          <span className="block truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
            {detail}
          </span>
          <span className="block text-[0.8125rem] leading-[1.125rem] text-muted-foreground sm:hidden">
            Next {formatShortDate(next)}
          </span>
        </span>
        <span className="hidden text-sm sm:block">{formatShortDate(next)}</span>
        <span className="text-right">
          <Money value={amount} className="tnum block text-[0.9375rem] font-medium" />
          {note && <span className="block text-xs text-muted-foreground">{note}</span>}
        </span>
      </Link>
      <span className="w-16 shrink-0 text-right transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 sm:opacity-0 [@media(hover:none)]:opacity-100">
        {action}
      </span>
    </li>
  );
}

export function SubscriptionsView({
  data,
  addForm,
  renderRuleButton,
  renderBillButton,
  renderRestoreButton,
  basePath = "",
}: {
  data: SubscriptionsData;
  addForm: ReactNode;
  renderRuleButton: (subscription: SubscriptionInsight) => ReactNode;
  renderBillButton: (bill: RecurringBill) => ReactNode;
  renderRestoreButton?: (rule: SubscriptionsData["dismissed"][number]) => ReactNode;
  basePath?: string;
}) {
  const { metrics } = data;
  const byNextDate = <T extends { nextExpectedAt: string }>(items: T[]) =>
    [...items].sort((a, b) => Date.parse(a.nextExpectedAt) - Date.parse(b.nextExpectedAt));
  const hrefFor = (merchant: string) =>
    `${basePath}/transactions?q=${encodeURIComponent(merchant)}`;
  const anything = metrics.detected > 0 || data.bills.length > 0;
  const cardRow = metrics.cardBalance > 0 ? data.cardPayment : null;

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageHeader
        note
        title={
          anything ? (
            <>
              <Money value={metrics.monthlyEstimate + metrics.billsMonthly} whole /> a month in bills and subscriptions
            </>
          ) : (
            "Nothing recurring found yet"
          )
        }
        detail={
          anything ? (
            <>
              <Money value={metrics.billsMonthly} whole /> is bills. <Money value={metrics.monthlyEstimate} whole /> is subscriptions, which comes to{" "}
              <Money value={metrics.annualEstimate} whole /> a year.
            </>
          ) : (
            "These appear after a few matching charges. You can also add one from a past charge."
          )
        }
        action={addForm}
      />

      <section aria-labelledby="subscriptions-heading">
        <SectionHeading
          title={<span id="subscriptions-heading">Subscriptions</span>}
          detail={
            metrics.detected
              ? `${plural(metrics.detected, "service")}, soonest first. Worth a look if you're trimming costs.`
              : undefined
          }
        />
        <Panel className="overflow-hidden">
          {data.subscriptions.length ? (
            <ul className="divide-y">
              {byNextDate(data.subscriptions).map((item) => (
                <RecurringRow
                  key={item.streamKey}
                  merchant={item.merchant}
                  category={item.category}
                  href={hrefFor(item.merchant)}
                  next={item.nextExpectedAt}
                  amount={item.averageAmount}
                  note={item.cadence !== "Monthly" ? item.cadence.toLowerCase() : undefined}
                  detail={
                    item.previousAmount !== null ? (
                      <PriceChange item={item} />
                    ) : (
                      <>
                        {item.cadence}, {categoryLabel(item.category).toLowerCase()}
                      </>
                    )
                  }
                  action={renderRuleButton(item)}
                />
              ))}
            </ul>
          ) : (
            <EmptyNote
              title="No subscriptions yet"
              detail="It takes three matching charges to recognize one, or two yearly renewals."
            />
          )}
        </Panel>
      </section>

      {data.bills.length > 0 && (
        <section aria-labelledby="bills-heading">
          <SectionHeading
            title={<span id="bills-heading">Regular bills</span>}
            detail="Amounts are recent averages, since some change month to month"
          />
          <Panel className="overflow-hidden">
            <ul className="divide-y">
              {byNextDate(data.bills).map((item) => (
                <RecurringRow
                  key={item.streamKey}
                  merchant={item.merchant}
                  category={item.category}
                  href={hrefFor(item.merchant)}
                  next={item.nextExpectedAt}
                  amount={item.amount}
                  detail={<>Monthly, {categoryLabel(item.category).toLowerCase()}</>}
                  action={renderBillButton(item)}
                />
              ))}
            </ul>
          </Panel>
        </section>
      )}

      {cardRow && (
        <section aria-labelledby="card-heading">
          <SectionHeading
            title={<span id="card-heading">Also due</span>}
            detail="Not in the totals above, because what's on your card is already counted as spending"
          />
          <Panel className="overflow-hidden">
            <ul>
              <RecurringRow
                merchant="Credit card payment"
                category="LOAN_PAYMENTS"
                href={`${basePath}/accounts`}
                next={cardRow.nextExpectedAt}
                amount={metrics.cardBalance}
                detail="What you owe across your cards today"
                action={null}
              />
            </ul>
          </Panel>
        </section>
      )}

      {data.dismissed.length > 0 && (
        <section aria-labelledby="dismissed-heading">
          <SectionHeading
            title={<span id="dismissed-heading">Hidden</span>}
            detail="You told us these aren't recurring"
          />
          <Panel className="overflow-hidden">
            <ul className="divide-y">
              {data.dismissed.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[0.9375rem] font-medium leading-snug">{item.merchant}</span>
                    <span className="block text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{categoryLabel(item.category)}</span>
                  </span>
                  {renderRestoreButton?.(item)}
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      )}
    </div>
  );
}
