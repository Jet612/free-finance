import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { CategoryIcon } from "@/components/category-icon";
import { FlowChart } from "@/components/charts/flow-chart";
import { SegmentBar, type Segment } from "@/components/charts/segment-bar";
import { MiniBars } from "@/components/charts/sparkline";
import { MerchantIcon } from "@/components/merchant-icon";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { EmptyNote, PageHeader, Panel, SectionHeading } from "@/components/page-header";
import { categoryColor, categoryLabel, subcategoryLabel } from "@/lib/categories";
import type { SpendingCategory, SpendingData } from "@/lib/detail-data";
import {
  formatLongMonth,
  formatMonthYear,
  formatPercent,
  formatShortDate,
  formatWholeCurrency,
  plural,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_NAMED_SEGMENTS = 5;
const NOTABLE_CHANGE = 0.2;
const NOTABLE_DOLLARS = 25;

function segments(categories: SpendingCategory[]): Segment[] {
  const named = categories
    .filter((item) => categoryColor(item.category) !== "var(--cat-other)")
    .slice(0, MAX_NAMED_SEGMENTS);
  const names = new Set(named.map((item) => item.category));
  const rest = categories
    .filter((item) => !names.has(item.category))
    .reduce((sum, item) => sum + item.value, 0);
  return [
    ...named.map((item) => ({
      key: item.category,
      label: categoryLabel(item.category),
      value: item.value,
      color: categoryColor(item.category),
    })),
    { key: "other", label: "Everything else", value: rest, color: "var(--cat-other)" },
  ];
}

function CategoryCompare({
  item,
  inProgress,
  limit,
}: {
  item: SpendingCategory;
  inProgress: boolean;
  limit: number | undefined;
}) {
  if (limit !== undefined) {
    const left = limit - item.value;
    return left >= 0 ? (
      <>
        <Money value={left} whole /> under budget
      </>
    ) : (
      <span className="font-medium text-negative">
        <Money value={-left} whole /> over budget
      </span>
    );
  }
  if (item.usual === null || item.usual <= 0) {
    return <>Nothing like this recently</>;
  }
  // Half a month against a whole one says nothing, so don't pretend it does.
  if (inProgress) {
    return (
      <>
        Usually <Money value={item.usual} whole />
      </>
    );
  }
  const change = item.value - item.usual;
  if (Math.abs(change) < Math.max(item.usual * 0.05, 5)) {
    return <>About the same as usual</>;
  }
  const notable =
    change > NOTABLE_DOLLARS && change / item.usual >= NOTABLE_CHANGE;
  return (
    <span className={cn(notable && "font-medium text-warning")}>
      <Money value={Math.abs(change)} whole /> {change > 0 ? "more" : "less"} than usual
    </span>
  );
}

function CategoryRow({
  item,
  monthKey,
  inProgress,
  limit,
  transactionsHref,
}: {
  item: SpendingCategory;
  monthKey: string;
  inProgress: boolean;
  limit: number | undefined;
  transactionsHref: string;
}) {
  const label = categoryLabel(item.category);
  const otherMerchants =
    item.value - item.merchants.reduce((sum, merchant) => sum + merchant.value, 0);
  return (
    <details className="group/row">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 outline-offset-[-2px] transition-colors hover:bg-accent/50 [&::-webkit-details-marker]:hidden">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <CategoryIcon category={item.category} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium leading-snug">{label}</span>
          <span className="block truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
            <CategoryCompare item={item} inProgress={inProgress} limit={limit} />
          </span>
        </span>
        <MiniBars values={item.history} className="hidden sm:flex" />
        <Money value={item.value} className="tnum w-24 shrink-0 text-right text-[0.9375rem] font-medium" />
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/row:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="grid gap-5 border-t bg-muted/40 px-4 py-4 sm:grid-cols-2 sm:pl-[3.625rem]">
        <div>
          <h3 className="text-[0.8125rem] font-medium text-muted-foreground">What it was</h3>
          <ul className="mt-1.5 grid grid-cols-1 gap-1 text-sm">
            {item.details.map((detail) => (
              <li key={detail.detail ?? "other"} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{subcategoryLabel(detail.detail, item.category)}</span>
                <Money value={detail.value} className="tnum shrink-0" />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-[0.8125rem] font-medium text-muted-foreground">Where</h3>
          <ul className="mt-1.5 grid grid-cols-1 gap-1 text-sm">
            {item.merchants.map((merchant) => (
              <li key={merchant.merchant} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{merchant.merchant}</span>
                <Money value={merchant.value} className="tnum shrink-0" />
              </li>
            ))}
            {otherMerchants >= 0.5 && (
              <li className="flex justify-between gap-3 text-muted-foreground">
                <span>Everywhere else</span>
                <Money value={otherMerchants} className="tnum shrink-0" />
              </li>
            )}
          </ul>
        </div>
        <Link
          href={`${transactionsHref}?category=${item.category}&month=${monthKey}`}
          className="text-[0.8125rem] font-medium underline underline-offset-3 sm:col-span-2"
        >
          See these transactions
        </Link>
      </div>
    </details>
  );
}

function Row({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-2.5 outline-offset-[-2px] transition-colors hover:bg-accent/50"
      >
        {children}
      </Link>
    </li>
  );
}

export function SpendingView({
  data,
  monthPicker,
  basePath = "",
}: {
  data: SpendingData;
  monthPicker: ReactNode;
  basePath?: string;
}) {
  const { metrics, selectedMonth, today } = data;
  const monthKey = selectedMonth.slice(0, 7);
  const inProgress = monthKey === today.slice(0, 7);
  const monthName = formatLongMonth(selectedMonth);
  const transactionsHref = `${basePath}/transactions`;
  const reportsHref = `${basePath}/reports`;
  const kept = metrics.net;
  const chartMonths = data.monthly.slice(-12);
  // Fixed to the latest finished months, so it doesn't move as months are chosen.
  const recentFinished = data.monthly
    .filter((item) => item.month.slice(0, 7) < today.slice(0, 7) && item.spending > 0)
    .slice(-3);
  const usualLine = recentFinished.length
    ? recentFinished.reduce((sum, item) => sum + item.spending, 0) / recentFinished.length
    : null;
  // One-off purchases already appear under biggest purchases.
  const regulars = data.topMerchants.filter((item) => item.count > 1);
  const hasHistory = data.monthly.some((item) => item.income > 0 || item.spending > 0);

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageHeader
        note
        title={
          metrics.spending > 0 ? (
            <>
              <Money value={metrics.spending} whole /> spent {inProgress ? "so far in" : "in"} {monthName}
            </>
          ) : (
            `Nothing spent ${inProgress ? "yet in" : "in"} ${monthName}`
          )
        }
        detail={
          <>
            {metrics.income > 0 && inProgress ? (
              <>
                <Money value={metrics.income} whole /> has come in so far.{" "}
              </>
            ) : metrics.income > 0 ? (
              <>
                <Money value={metrics.income} whole /> came in, so you{" "}
                {kept >= 0 ? "kept" : "went over by"} <Money value={Math.abs(kept)} whole />
                {kept >= 0 && metrics.savingsRate !== null && <> ({formatPercent(metrics.savingsRate, 0)} of income)</>}
                .{" "}
              </>
            ) : null}
            {metrics.averageSpending !== null && (
              <>
                A usual month runs about <Money value={metrics.averageSpending} whole />.
              </>
            )}
          </>
        }
        action={monthPicker}
      />

      {hasHistory && (
        <Panel className="p-4 sm:p-5">
          <SectionHeading title="Month by month" detail="A bar below its income line means you kept money. Choose a month to see it." />
          <FlowChart
            months={chartMonths}
            selected={selectedMonth}
            currentMonth={today.slice(0, 7)}
            usual={usualLine}
            hrefFor={(month) => `${reportsHref}?month=${month.slice(0, 7)}`}
          />
        </Panel>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="grid grid-cols-1 gap-8">
        <section aria-labelledby="categories-heading">
          <SectionHeading title={<span id="categories-heading">Where it went</span>} />
          {data.categories.length ? (
            <>
              <SegmentBar
                className="mb-4"
                segments={segments(data.categories)}
                format={formatWholeCurrency}
                ariaLabel={`Spending by category in ${formatMonthYear(selectedMonth)}`}
              />
              <Panel className="divide-y overflow-hidden">
                {data.categories.map((item) => (
                  <CategoryRow
                    key={item.category}
                    item={item}
                    monthKey={monthKey}
                    inProgress={inProgress}
                    limit={data.limits[item.category]}
                    transactionsHref={transactionsHref}
                  />
                ))}
              </Panel>
            </>
          ) : (
            <Panel>
              <EmptyNote
                title={hasHistory ? `No spending in ${monthName}` : "This fills in once you connect an account"}
                detail={hasHistory ? "Try another month, or check back after your next update." : undefined}
                action={
                  hasHistory ? undefined : (
                    <Button asChild>
                      <Link href={`${basePath}/setup`}>Connect an account</Link>
                    </Button>
                  )
                }
              />
            </Panel>
          )}
        </section>

        {data.incomeSources.length > 0 && (
          <section aria-labelledby="income-heading">
            <SectionHeading title={<span id="income-heading">Income</span>} />
            <Panel className="overflow-hidden">
              <ul className="divide-y">
                {data.incomeSources.map((item) => (
                  <li key={item.source} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-[0.9375rem] font-medium leading-snug">{item.source}</span>
                      <span className="block text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{plural(item.count, "deposit")}</span>
                    </span>
                    <Money value={item.value} className="tnum shrink-0 text-[0.9375rem]" />
                  </li>
                ))}
              </ul>
            </Panel>
          </section>
        )}
        </div>

        <div className="grid grid-cols-1 gap-8">
          {data.largest.length > 0 && (
            <section aria-labelledby="largest-heading">
              <SectionHeading title={<span id="largest-heading">Biggest purchases</span>} />
              <Panel className="overflow-hidden">
                <ul className="divide-y">
                  {data.largest.map((item) => (
                    <Row key={item.id} href={`${transactionsHref}?open=${item.id}`}>
                      <MerchantIcon category={item.category} categoryDetailed={item.categoryDetailed} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium leading-snug">{item.merchant}</span>
                        <span className="block text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{formatShortDate(item.date)}</span>
                      </span>
                      <Money value={item.value} className="tnum shrink-0 text-[0.9375rem]" />
                    </Row>
                  ))}
                </ul>
              </Panel>
            </section>
          )}

          {regulars.length > 0 && (
            <section aria-labelledby="merchants-heading">
              <SectionHeading title={<span id="merchants-heading">Places you keep going back to</span>} />
              <Panel className="overflow-hidden">
                <ul className="divide-y">
                  {regulars.map((item) => (
                    <Row
                      key={item.merchant}
                      href={`${transactionsHref}?q=${encodeURIComponent(item.merchant)}&month=${monthKey}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium leading-snug">{item.merchant}</span>
                        <span className="block text-[0.8125rem] leading-[1.125rem] text-muted-foreground">{plural(item.count, "purchase")}</span>
                      </span>
                      <Money value={item.value} className="tnum shrink-0 text-[0.9375rem]" />
                    </Row>
                  ))}
                </ul>
              </Panel>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
