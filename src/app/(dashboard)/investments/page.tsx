import type { Metadata } from "next";
import { ChartPie, CircleDollarSign, Layers3, TrendingUp } from "lucide-react";

import { InvestmentHistoryChart } from "@/components/investment-history-chart";
import { PageHeader } from "@/components/page-header";
import { SummaryStrip } from "@/components/summary-strip";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInvestmentsData } from "@/lib/detail-data";
import {
  formatCurrency,
  formatPercent,
  formatQuantity,
  titleCase,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Investments" };

const allocationColors = [
  "bg-primary",
  "bg-cyan-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-slate-400",
];

export default async function InvestmentsPage() {
  const data = await getInvestmentsData();
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Investments"
        title="Portfolio detail without the noise"
        description="Current Robinhood positions, cost basis, unrealized performance, and allocation by asset type."
      />
      <SummaryStrip
        items={[
          {
            label: "Portfolio value",
            value: formatCurrency(data.metrics.value),
            detail:
              data.metrics.cashBalance > 0.005
                ? `${formatCurrency(data.metrics.investedValue)} invested · ${formatCurrency(data.metrics.cashBalance)} cash`
                : `${formatCurrency(data.metrics.investedValue)} invested`,
            icon: TrendingUp,
          },
          {
            label: "Cost basis",
            value: formatCurrency(data.metrics.costBasis),
            icon: CircleDollarSign,
          },
          {
            label: "Unrealized gain",
            value: formatCurrency(data.metrics.gain),
            detail: formatPercent(data.metrics.gainPercent),
            icon: ChartPie,
            tone: data.metrics.gain >= 0 ? "positive" : "negative",
          },
          {
            label: "Positions",
            value: String(data.metrics.positions),
            detail: "Stocks, ETFs, and crypto",
            icon: Layers3,
          },
        ]}
      />

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Portfolio history</CardTitle>
          <CardDescription>
            Daily investment account value from completed syncs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvestmentHistoryChart data={data.history} />
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Portfolio allocation</CardTitle>
          <CardDescription>
            Based on the current value of synced holdings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.allocation.length ? (
            <>
              <div className="flex h-3 overflow-hidden rounded-sm bg-muted">
                {data.allocation.map((item, index) => (
                  <span
                    key={item.type}
                    className={allocationColors[index % allocationColors.length]}
                    style={{ width: `${item.percent}%` }}
                    title={`${titleCase(item.type)} ${formatPercent(item.percent)}`}
                  />
                ))}
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {data.allocation.map((item, index) => (
                  <div key={item.type} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-1 size-2.5 rounded-sm",
                        allocationColors[index % allocationColors.length],
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {titleCase(item.type)}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(item.value)} ·{" "}
                        {formatPercent(item.percent)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No holdings synced yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="py-0 shadow-none">
        <div className="border-b px-4 py-4">
          <CardTitle>Holdings</CardTitle>
          <CardDescription className="mt-1">
            Sorted by current market value
          </CardDescription>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="pl-4">Position</TableHead>
              <TableHead className="hidden sm:table-cell">Quantity</TableHead>
              <TableHead className="hidden lg:table-cell">Avg. cost</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="pr-4 text-right">Gain</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.holdings.map((holding) => (
              <TableRow key={holding.id}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-muted font-mono text-xs font-semibold">
                      {holding.symbol.slice(0, 4)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">{holding.symbol}</p>
                      <p className="max-w-48 truncate text-xs text-muted-foreground">
                        {holding.name}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden font-mono text-xs tabular-nums sm:table-cell">
                  {formatQuantity(holding.quantity)}
                </TableCell>
                <TableCell className="hidden font-mono text-xs tabular-nums lg:table-cell">
                  {holding.averageCost == null
                    ? "—"
                    : formatCurrency(holding.averageCost)}
                </TableCell>
                <TableCell className="font-mono text-xs tabular-nums">
                  {holding.currentPrice == null
                    ? "—"
                    : formatCurrency(holding.currentPrice)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-medium tabular-nums">
                  {formatCurrency(holding.currentValue)}
                </TableCell>
                <TableCell
                  className={cn(
                    "pr-4 text-right font-mono text-xs tabular-nums",
                    (holding.unrealizedGain ?? 0) >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                  )}
                >
                  {holding.unrealizedGain == null
                    ? "—"
                    : formatCurrency(holding.unrealizedGain)}
                  <Badge
                    variant="outline"
                    className="ml-2 hidden font-normal xl:inline-flex"
                  >
                    {formatPercent(holding.unrealizedGainPercent)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
