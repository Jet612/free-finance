"use client";

import { TimeChart } from "@/components/charts/time-chart";
import type { MonthPace } from "@/lib/insights";
import {
  formatCompactCurrency,
  formatShortDate,
  formatWholeCurrency,
} from "@/lib/format";

export function PaceChart({ pace, month }: { pace: MonthPace; month: string }) {
  const labels = pace.points.map(
    (point) => `${month}-${String(point.day).padStart(2, "0")}`,
  );
  const hasUsual = pace.comparisonMonths > 0;
  const middle = Math.floor(pace.daysInMonth / 2);

  return (
    <div>
      <TimeChart
        height={170}
        zeroBaseline
        labels={labels}
        series={[
          ...(hasUsual
            ? [
                {
                  key: "usual",
                  label: "Usual",
                  color: "var(--series-usual)",
                  values: pace.points.map((point) => point.usual),
                  subdued: true,
                },
              ]
            : []),
          {
            key: "spent",
            label: "This month",
            color: "var(--foreground)",
            values: pace.points.map((point) => point.spent),
            primary: true,
          },
        ]}
        xTicks={[0, middle, labels.length - 1]}
        formatValue={formatWholeCurrency}
        formatTick={formatCompactCurrency}
        formatLabel={(date) => formatShortDate(date)}
        ariaLabel="Everyday spending so far this month compared with a usual month"
      />
      {hasUsual && (
        <ul className="mt-2 flex gap-4 text-[0.8125rem] text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-foreground" />
            This month
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-0.5 w-4 rounded-full"
              style={{ background: "var(--series-usual)" }}
            />
            Usual, from your last {pace.comparisonMonths === 1 ? "month" : `${pace.comparisonMonths} months`}
          </li>
        </ul>
      )}
    </div>
  );
}
