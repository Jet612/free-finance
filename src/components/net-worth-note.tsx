"use client";

import { type ReactNode, useMemo, useState } from "react";

import { TimeChart } from "@/components/charts/time-chart";
import { Seal } from "@/components/brand";
import { Money } from "@/components/money";
import type { TrendPoint } from "@/lib/data";
import type { NetWorthBreakdown } from "@/lib/dashboard-summary";
import {
  formatCompactCurrency,
  formatPercent,
  formatShortDate,
  formatWholeCurrency,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const RANGES = [
  { key: "1W", days: 7, phrase: "in the past week" },
  { key: "1M", days: 30, phrase: "in the past month" },
  { key: "3M", days: 90, phrase: "in the past 3 months" },
  { key: "6M", days: 180, phrase: "in the past 6 months" },
  { key: "1Y", days: 365, phrase: "in the past year" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function cutoffDate(latest: string, days: number): string {
  const date = new Date(`${latest}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** The dark banknote panel: the one bold thing on the page. */
export function NetWorthNote({
  netWorth,
  trend,
  breakdown,
  heading = "h2",
  outOfDate = [],
}: {
  netWorth: number;
  trend: TrendPoint[];
  breakdown: NetWorthBreakdown;
  heading?: "h1" | "h2";
  /** Institutions whose balances may be old. */
  outOfDate?: string[];
}) {
  const [range, setRange] = useState<RangeKey>("3M");
  const Heading = heading;
  const latest = trend.at(-1)?.date;
  const earliest = trend[0]?.date;

  // Only offer a range the history can actually fill, plus the next one up.
  const ranges = useMemo(() => {
    if (!latest || !earliest) return [];
    const usable = RANGES.filter(
      (item) => cutoffDate(latest, item.days) >= earliest,
    );
    const next = RANGES[usable.length];
    return next ? [...usable, next] : [...usable];
  }, [earliest, latest]);

  const selected =
    ranges.find((item) => item.key === range) ?? ranges.at(-1) ?? RANGES[1];
  const points = useMemo(
    () =>
      latest
        ? trend.filter((point) => point.date >= cutoffDate(latest, selected.days))
        : [],
    [latest, selected.days, trend],
  );

  const start = points[0]?.value;
  const change = points.length > 1 && start !== undefined ? netWorth - start : null;
  const percent = change !== null && start ? (change / Math.abs(start)) * 100 : null;
  const coversRange =
    latest && earliest ? cutoffDate(latest, selected.days) >= earliest : false;
  const phrase = coversRange
    ? selected.phrase
    : earliest
      ? `since ${formatShortDate(earliest)}`
      : "";
  const middle = Math.floor((points.length - 1) / 2);
  const yesterday = trend.at(-2)?.value;
  const sinceYesterday = yesterday === undefined ? null : netWorth - yesterday;

  const parts: { label: string; value: number }[] = [
    { label: "Cash", value: breakdown.cash },
    { label: "Investments", value: breakdown.investments },
    { label: "Credit cards", value: breakdown.credit },
    { label: "Loans", value: breakdown.loans },
    { label: "Other", value: breakdown.other },
  ].filter((item) => item.value !== 0);

  return (
    <section
      aria-labelledby="net-worth-heading"
      className="relative h-full min-w-0 overflow-hidden rounded-2xl bg-note text-note-foreground"
    >
      <Seal
        rings={26}
        strokeWidth={0.6}
        className="pointer-events-none absolute -right-[17rem] -top-[17rem] size-[34rem] text-note-line/14"
      />
      <div className="relative p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <Heading
              id="net-worth-heading"
              className="text-[0.9375rem] font-medium text-note-muted"
            >
              Net worth
            </Heading>
            <p className="wide mt-1 text-[2.25rem] font-semibold leading-none tracking-[-0.03em] sm:text-[3.5rem]">
              <Money value={netWorth} whole />
            </p>
            {change !== null ? (
              <p className="mt-2.5 text-[0.9375rem] text-note-muted">
                <span
                  className={cn(
                    "font-semibold",
                    change >= 0 ? "text-note-positive" : "text-note-negative",
                  )}
                >
                  {change >= 0 ? "Up " : "Down "}
                  <Money value={Math.abs(change)} whole />
                  {percent !== null && (
                    <> ({formatPercent(Math.abs(percent), 1)})</>
                  )}
                </span>{" "}
                {phrase}
              </p>
            ) : (
              <p className="mt-2.5 text-[0.9375rem] text-note-muted">
                Your trend starts after a second daily update.
              </p>
            )}
            {sinceYesterday !== null && Math.abs(sinceYesterday) >= 1 && (
              <p className="mt-0.5 text-[0.8125rem] text-note-muted">
                <Money value={sinceYesterday} signed whole /> since yesterday
              </p>
            )}
            {outOfDate.length > 0 && (
              <p className="mt-0.5 text-[0.8125rem] text-note-muted">
                {outOfDate.join(" and ")} {outOfDate.length === 1 ? "is" : "are"} out of date, so this may be off.
              </p>
            )}
          </div>
          {ranges.length > 1 && (
            <div
              role="group"
              aria-label="Time range"
              className="flex w-fit shrink-0 rounded-lg bg-black/15 p-0.5"
            >
              {ranges.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={item.key === selected.key}
                  onClick={() => setRange(item.key)}
                  className={cn(
                    "min-h-8 rounded-md px-2.5 text-[0.8125rem] font-medium text-note-muted transition-colors hover:text-note-foreground focus-visible:outline-note-foreground",
                    item.key === selected.key &&
                      "bg-note-foreground text-note hover:text-note",
                  )}
                >
                  {item.key}
                </button>
              ))}
            </div>
          )}
        </div>

        {points.length > 1 && (
          <TimeChart
            className="mt-5"
            height={190}
            heightClassName="h-[7.5rem] sm:h-[11.875rem]"
            engraved
            onNote
            minSpan={0.03}
            labels={points.map((point) => point.date)}
            series={[
              {
                key: "net-worth",
                label: "Net worth",
                color: "var(--note-foreground)",
                values: points.map((point) => point.value),
                primary: true,
              },
            ]}
            xTicks={[0, middle, points.length - 1]}
            formatValue={formatWholeCurrency}
            formatTick={formatCompactCurrency}
            formatLabel={(date) => formatShortDate(date, selected.days > 200)}
            ariaLabel={`Net worth ${phrase}`}
          />
        )}

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-note-foreground/15 pt-4 sm:flex sm:gap-x-10">
          {parts.map((item) => (
            <Figure key={item.label} label={item.label}>
              <Money value={item.value} whole />
            </Figure>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.8125rem] text-note-muted">{label}</dt>
      <dd className="semiwide mt-0.5 text-[1.0625rem] font-semibold tracking-[-0.01em]">
        {children}
      </dd>
    </div>
  );
}
