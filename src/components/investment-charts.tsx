"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  titleCase,
} from "@/lib/format";

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const allocationConfig = {
  value: {
    label: "Value",
  },
} satisfies ChartConfig;

const holdingsConfig = {
  value: {
    label: "Current value",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type Allocation = { type: string; value: number; percent: number }[];
type Holdings = {
  symbol: string;
  currentValue: number;
  unrealizedGain: number | null;
  unrealizedGainPercent: number | null;
}[];

export function InvestmentAllocationChart({
  data,
}: {
  data: Allocation;
}) {
  if (!data.length) {
    return <InvestmentChartEmptyState />;
  }

  const chartData = data.map((item, index) => ({
    ...item,
    label: titleCase(item.type),
    fill: chartColors[index % chartColors.length],
  }));

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.7fr)]">
      <ChartContainer
        config={allocationConfig}
        className="mx-auto h-[240px] w-full max-w-[300px] aspect-auto"
      >
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                hideIndicator
                formatter={(value, _name, item) => (
                  <div className="grid min-w-36 gap-0.5">
                    <span className="font-medium">
                      {String(item.payload.label)}
                    </span>
                    <span className="font-mono text-muted-foreground tabular-nums">
                      {formatCurrency(Number(value))} ·{" "}
                      {formatPercent(Number(item.payload.percent))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="label"
            innerRadius={62}
            outerRadius={94}
            paddingAngle={2}
            strokeWidth={0}
          >
            {chartData.map((item) => (
              <Cell key={item.type} fill={item.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="grid gap-3">
        {chartData.map((item) => (
          <div key={item.type} className="flex items-center gap-2.5">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: item.fill }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium">
                  {item.label}
                </span>
                <span className="font-mono text-xs tabular-nums">
                  {formatPercent(item.percent)}
                </span>
              </div>
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {formatCurrency(item.value)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HoldingsValueChart({ data }: { data: Holdings }) {
  if (!data.length) {
    return <InvestmentChartEmptyState />;
  }

  const chartData = data.slice(0, 8).map((holding) => ({
    symbol: holding.symbol,
    value: holding.currentValue,
    gain: holding.unrealizedGain,
    gainPercent: holding.unrealizedGainPercent,
  }));

  return (
    <ChartContainer
      config={holdingsConfig}
      className="h-[280px] w-full aspect-auto"
    >
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ left: 4, right: 16, top: 8, bottom: 4 }}
        accessibilityLayer
      >
        <CartesianGrid horizontal={false} strokeDasharray="4 4" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={formatCompactCurrency}
        />
        <YAxis
          dataKey="symbol"
          type="category"
          tickLine={false}
          axisLine={false}
          width={54}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.45 }}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, _name, item) => (
                <div className="grid min-w-40 gap-1">
                  <div className="flex justify-between gap-4">
                    <span className="font-medium">
                      {String(item.payload.symbol)}
                    </span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatCurrency(Number(value))}
                    </span>
                  </div>
                  {item.payload.gain != null ? (
                    <div className="flex justify-between gap-4 text-muted-foreground">
                      <span>Unrealized gain</span>
                      <span className="font-mono tabular-nums">
                        {formatCurrency(Number(item.payload.gain))} ·{" "}
                        {formatPercent(Number(item.payload.gainPercent))}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            />
          }
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          radius={[0, 5, 5, 0]}
          maxBarSize={22}
        />
      </BarChart>
    </ChartContainer>
  );
}

function InvestmentChartEmptyState() {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed bg-muted/20 px-8 text-center">
      <div>
        <p className="text-sm font-medium">No holdings to chart yet</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Synced investment positions will appear here.
        </p>
      </div>
    </div>
  );
}
