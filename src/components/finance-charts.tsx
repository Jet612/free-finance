"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { SpendingPoint, TrendPoint } from "@/lib/data";
import {
  formatCompactCurrency,
  formatCurrency,
  titleCase,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const netWorthConfig = {
  value: {
    label: "Net worth",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const spendingConfig = {
  value: {
    label: "Spent",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function NetWorthChart({ data }: { data: TrendPoint[] }) {
  const [range, setRange] = useState<"30D" | "90D" | "1Y">("90D");
  const visibleData = useMemo(() => {
    if (!data.length) return data;
    const days = range === "30D" ? 30 : range === "90D" ? 90 : 365;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    return data.filter((point) => point.date >= cutoffDate);
  }, [data, range]);

  if (!data.length) {
    return (
      <ChartEmptyState
        title="Your trend starts after the first sync"
        detail="Daily snapshots will build a private net worth history here."
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <div
          className="inline-flex rounded-lg border bg-background p-0.5"
          aria-label="Net worth time range"
        >
          {(["30D", "90D", "1Y"] as const).map((option) => (
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
        config={netWorthConfig}
        className="h-[240px] w-full aspect-auto sm:h-[280px]"
      >
        <AreaChart
          data={visibleData}
          margin={{ left: 4, right: 12, top: 12 }}
        >
        <defs>
          <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
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
                <div className="flex min-w-32 items-center justify-between gap-4">
                  <span className="text-muted-foreground">Net worth</span>
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
          fill="url(#netWorthFill)"
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

export function SpendingChart({ data }: { data: SpendingPoint[] }) {
  if (!data.length) {
    return (
      <ChartEmptyState
        title="No spending yet"
        detail="Categorized Plaid transactions from the last 30 days appear here."
      />
    );
  }

  const normalized = data.map((point) => ({
    ...point,
    category: titleCase(point.category),
  }));

  return (
    <ChartContainer
      config={spendingConfig}
      className="h-[280px] w-full aspect-auto"
    >
      <BarChart
        data={normalized}
        layout="vertical"
        margin={{ left: 8, right: 16, top: 8 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="4 4" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={formatCompactCurrency}
        />
        <YAxis
          dataKey="category"
          type="category"
          tickLine={false}
          axisLine={false}
          width={92}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, _name, item) => (
                <div className="flex min-w-36 items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    {String(item.payload.category)}
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatCurrency(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          radius={[0, 5, 5, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ChartContainer>
  );
}

function ChartEmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed bg-muted/20 px-8 text-center">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}
