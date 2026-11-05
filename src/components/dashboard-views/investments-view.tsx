import type { ReactNode } from "react";

import { SegmentBar } from "@/components/charts/segment-bar";
import { HoldingsTable } from "@/components/holdings-table";
import { InvestmentHistory } from "@/components/investment-history";
import { Money } from "@/components/money";
import { EmptyNote, PageHeader, Panel, SectionHeading } from "@/components/page-header";
import type { InvestmentsData } from "@/lib/detail-data";
import { assetTypeLabel, formatPercent, formatWholeCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const CONCENTRATED_SHARE = 25;
const SINGLE_NAME_TYPES = new Set(["equity", "cryptocurrency", "derivative"]);

export function InvestmentsView({
  data,
  emptyAction,
}: {
  data: InvestmentsData;
  emptyAction?: ReactNode;
}) {
  const { metrics } = data;

  if (!data.accounts.length) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageHeader title="No investments yet" />
        <Panel>
          <EmptyNote
            title="Connect a brokerage"
            detail="Robinhood, Fidelity, and most others work. You'll see your holdings, gains, and how your money is spread out."
            action={emptyAction}
          />
        </Panel>
      </div>
    );
  }

  const concentrated = data.holdings.find(
    (holding) =>
      holding.share >= CONCENTRATED_SHARE &&
      SINGLE_NAME_TYPES.has(holding.assetType.toLowerCase()),
  );

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageHeader
        note
        title={
          <>
            <Money value={metrics.value} whole /> invested
          </>
        }
        detail={
          metrics.gain === null ? (
            "Your brokerage doesn't share what you paid, so gains can't be shown."
          ) : (
            <>
              <span className={cn("font-semibold", metrics.gain >= 0 ? "text-note-positive" : "text-note-negative")}>
                {metrics.gain >= 0 ? "Up" : "Down"} <Money value={Math.abs(metrics.gain)} whole /> ({formatPercent(Math.abs(metrics.gainPercent ?? 0), 1)})
              </span>{" "}
              on the <Money value={metrics.costBasis ?? 0} whole /> you put in
              {metrics.gainIsPartial && ". Some holdings don't share what you paid, so this covers only part of your portfolio"}.
            </>
          )
        }
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby="history-heading">
          <SectionHeading title={<span id="history-heading">Over time</span>} />
          <Panel className="p-4 sm:p-5">
            <InvestmentHistory history={data.history} />
          </Panel>
        </section>

        <section aria-labelledby="mix-heading">
          <SectionHeading title={<span id="mix-heading">Your mix</span>} />
          <Panel className="p-4 sm:p-5">
            <SegmentBar
              segments={data.allocation.slice(0, 6).map((item, index) => ({
                key: item.type,
                label: assetTypeLabel(item.type),
                value: item.value,
                color: `var(--cat-${index + 1})`,
              }))}
              format={formatWholeCurrency}
              ariaLabel="How your investments are spread"
            />
            <ul className="mt-4 grid gap-1.5 border-t pt-3 text-[0.9375rem]">
              {data.allocation.map((item) => (
                <li key={item.type} className="flex justify-between gap-3">
                  <span>{assetTypeLabel(item.type)}</span>
                  <span className="flex gap-3">
                    <span className="tnum text-muted-foreground">{formatPercent(item.percent, 0)}</span>
                    <Money value={item.value} whole className="tnum w-20 text-right" />
                  </span>
                </li>
              ))}
            </ul>
            {concentrated && (
              <p className="mt-3 text-[0.8125rem] leading-5 text-warning">
                {concentrated.symbol} alone is {formatPercent(concentrated.share, 0)} of your portfolio, which is a lot to ride on one name.
              </p>
            )}
          </Panel>
        </section>
      </div>

      {data.holdings.length > 0 && (
        <section aria-labelledby="holdings-heading">
          <SectionHeading
            title={<span id="holdings-heading">Holdings</span>}
            detail="Everything you own, combined across accounts"
          />
          <Panel className="overflow-x-auto">
            <HoldingsTable holdings={data.holdings} />
          </Panel>
        </section>
      )}

      <section aria-labelledby="accounts-heading">
        <SectionHeading title={<span id="accounts-heading">Accounts</span>} />
        <Panel className="overflow-hidden">
          <ul className="divide-y">
            {data.accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[0.9375rem] font-medium leading-snug">{account.name}</span>
                  <span className="block truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
                    {account.institutionName}
                    {account.mask && <> ending {account.mask}</>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Money value={account.value} className="tnum block text-[0.9375rem] font-medium" />
                  {account.gain === null ? (
                    <span className="block text-[0.8125rem] text-muted-foreground">Gain not shared</span>
                  ) : (
                    <span className={cn("block text-[0.8125rem]", account.gain >= 0 ? "text-positive" : "text-negative")}>
                      <Money value={account.gain} signed whole /> ({formatPercent(Math.abs(account.gainPercent ?? 0), 1)})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>
    </div>
  );
}
