"use client";

import { useState } from "react";

import { TimeChart } from "@/components/charts/time-chart";
import type { InvestmentsData } from "@/lib/detail-data";
import {
  formatCompactCurrency,
  formatShortDate,
  formatWholeCurrency,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const VIEWS = [
  { key: "value", label: "Value" },
  { key: "gain", label: "Gain or loss" },
] as const;

export function InvestmentHistory({ history }: { history: InvestmentsData["history"] }) {
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("value");
  if (history.length < 2) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Your history starts after a second daily update.
      </p>
    );
  }
  const middle = Math.floor((history.length - 1) / 2);
  const label = view === "value" ? "Value" : "Gain or loss";

  return (
    <div>
      <div role="group" aria-label="What to show" className="mb-4 inline-flex rounded-lg bg-secondary p-0.5">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={item.key === view}
            onClick={() => setView(item.key)}
            className={cn(
              "min-h-8 rounded-md px-3 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground",
              item.key === view && "bg-card text-foreground shadow-xs",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <TimeChart
        height={200}
        labels={history.map((point) => point.date)}
        series={[
          {
            key: view,
            label,
            color: "var(--foreground)",
            values: history.map((point) =>
              view === "value" ? point.marketValue : point.value,
            ),
            primary: true,
          },
        ]}
        xTicks={[0, middle, history.length - 1]}
        formatValue={formatWholeCurrency}
        formatTick={formatCompactCurrency}
        formatLabel={(date) => formatShortDate(date, true)}
        ariaLabel={`Investment ${label.toLowerCase()} over the past year`}
      />
    </div>
  );
}
