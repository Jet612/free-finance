"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
    label: "Portfolio value",
    color: "var(--chart-1)",
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
            Your history starts after the first sync
          </p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            Daily investment account snapshots will build a portfolio trend
            here.
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
          aria-label="Portfolio history time range"
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
        <AreaChart
          data={visibleData}
          margin={{ left: 4, right: 12, top: 12 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient
              id="investmentHistoryFill"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="5%"
                stopColor="var(--color-value)"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="var(--color-value)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
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
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => shortDate(String(label))}
                formatter={(value) => (
                  <div className="flex min-w-40 items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      Portfolio value
                    </span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatCurrency(Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-value)"
            strokeWidth={2.25}
            fill="url(#investmentHistoryFill)"
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
