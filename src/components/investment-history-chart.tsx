"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { InvestmentsData } from "@/lib/detail-data";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const chartConfig = {
  value: {
    label: "Gain/loss",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

type Range = "1M" | "3M" | "1Y";

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function InvestmentHistoryChart({
  data,
}: {
  data: InvestmentsData["history"];
}) {
  const [range, setRange] = useState<Range>("3M");
  const visibleData = useMemo(() => {
    if (!data.length) return data;
    const days = range === "1M" ? 30 : range === "3M" ? 90 : 365;
    const latestDate = new Date(`${data[data.length - 1].date}T12:00:00Z`);
    latestDate.setUTCDate(latestDate.getUTCDate() - days);
    const cutoffDate = latestDate.toISOString().slice(0, 10);
    return data.filter((point) => point.date >= cutoffDate);
  }, [data, range]);

  if (!data.length) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-dashed bg-muted/20 px-8 text-center">
        <div>
          <p className="text-sm font-medium">
            Unrealized gain/loss history starts after the next sync
          </p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            Each investment sync records the exact total market value and cost
            basis for this graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <div
          className="inline-flex rounded-lg border bg-background p-0.5"
          aria-label="Investment gains and losses time range"
        >
          {(["1M", "3M", "1Y"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              aria-pressed={range === option}
              className={cn(
                "h-7 rounded-md px-3 text-[11px] font-medium text-muted-foreground transition-colors",
                range === option &&
                  "bg-primary/10 text-primary ring-1 ring-primary/25",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <ChartContainer
        config={chartConfig}
        className="h-[300px] w-full aspect-auto sm:h-[360px]"
      >
        <LineChart
          data={visibleData}
          margin={{ left: 4, right: 12, top: 12 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <ReferenceLine y={0} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tickFormatter={shortDate}
          />
          <YAxis
            width={58}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatCompactCurrency}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => shortDate(String(label))}
                formatter={(value) => (
                  <div className="flex min-w-40 items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      {Number(value) >= 0 ? "Gain" : "Loss"}
                    </span>
                    <span
                      className={cn(
                        "font-mono font-medium tabular-nums",
                        Number(value) >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {formatCurrency(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Line
            dataKey="value"
            type="linear"
            stroke="var(--color-value)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "var(--color-value)" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
