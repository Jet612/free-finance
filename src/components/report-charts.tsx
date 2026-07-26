"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ReportsData } from "@/lib/detail-data";
import {
  formatCompactCurrency,
  formatCurrency,
  formatMonth,
} from "@/lib/format";

const config = {
  income: { label: "Income", color: "var(--chart-1)" },
  spending: { label: "Spending", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function CashFlowReportChart({
  data,
}: {
  data: ReportsData["monthly"];
}) {
  return (
    <ChartContainer config={config} className="h-[330px] w-full aspect-auto">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 16 }}>
        <CartesianGrid vertical={false} strokeDasharray="4 4" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickFormatter={formatMonth}
        />
        <YAxis
          width={58}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatCompactCurrency}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.45 }}
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatMonth(String(label))}
              formatter={(value, name) => (
                <div className="flex min-w-36 justify-between gap-4">
                  <span className="text-muted-foreground">
                    {name === "income" ? "Income" : "Spending"}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Legend />
        <Bar
          dataKey="income"
          fill="var(--color-income)"
          radius={[4, 4, 0, 0]}
          maxBarSize={34}
        />
        <Bar
          dataKey="spending"
          fill="var(--color-spending)"
          radius={[4, 4, 0, 0]}
          maxBarSize={34}
        />
      </BarChart>
    </ChartContainer>
  );
}
