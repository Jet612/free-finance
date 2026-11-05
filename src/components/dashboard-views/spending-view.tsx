import type { ReactNode } from "react";
import { ArrowDownToLine, ArrowUpFromLine, PiggyBank, Scale } from "lucide-react";

import { SpendingChart } from "@/components/finance-charts";
import { PageHeader } from "@/components/page-header";
import { MonthlyCashFlowChart } from "@/components/report-charts";
import { SummaryStrip } from "@/components/summary-strip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SpendingData } from "@/lib/detail-data";
import { formatCurrency, formatMonth, formatPercent, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

function CategoryChange({ value, previous }: { value: number; previous: number }) {
  if (previous <= 0) return <span className="text-xs text-muted-foreground">New this month</span>;
  const change = value - previous;
  if (Math.abs(change) < 1) return <span className="text-xs text-muted-foreground">About the same</span>;
  return (
    <span className={cn("text-xs", change < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
      {change < 0 ? "↓" : "↑"} {formatCurrency(Math.abs(change))} vs. last month
    </span>
  );
}

export function SpendingView({ data, monthPicker }: { data: SpendingData; monthPicker: ReactNode }) {
  const selectedMonthLabel = formatMonth(data.selectedMonth);

  return (
    <div className="grid gap-7">
      <PageHeader title="Spending" action={monthPicker} />
      <SummaryStrip items={[
        { label: "Income", value: formatCurrency(data.metrics.income), detail: selectedMonthLabel, icon: ArrowDownToLine },
        { label: "Spent", value: formatCurrency(data.metrics.spending), detail: data.metrics.averageSpending === null ? selectedMonthLabel : `Usually about ${formatCurrency(data.metrics.averageSpending)}`, icon: ArrowUpFromLine },
        { label: "Left over", value: formatCurrency(data.metrics.net), detail: `Income minus spending · ${selectedMonthLabel}`, icon: Scale, tone: data.metrics.net >= 0 ? "positive" : "negative" },
        { label: "Savings rate", value: formatPercent(data.metrics.savingsRate, 0), detail: "Share of income you kept", icon: PiggyBank, tone: (data.metrics.savingsRate ?? 0) >= 0 ? "default" : "negative" },
      ]} />
      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.4fr]">
        <Card className="shadow-none">
          <CardHeader><CardTitle>Spending by category</CardTitle><CardDescription>{selectedMonthLabel}</CardDescription></CardHeader>
          <CardContent><SpendingChart data={data.categories} /></CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader><CardTitle>Income vs spending</CardTitle><CardDescription>Six calendar months ending {selectedMonthLabel}</CardDescription></CardHeader>
          <CardContent><MonthlyCashFlowChart data={data.monthly} /></CardContent>
        </Card>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader><CardTitle>Categories compared</CardTitle><CardDescription>{selectedMonthLabel}, against the month before</CardDescription></CardHeader>
          <CardContent>
            {data.categories.length ? (
              <div className="divide-y">
                {data.categories.map((item) => (
                  <div key={item.category} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{titleCase(item.category)}</p><CategoryChange value={item.value} previous={item.previous} /></div>
                    <p className="shrink-0 font-mono text-sm tabular-nums">{formatCurrency(item.value)}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No spending in {selectedMonthLabel}.</p>}
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader><CardTitle>Where it went</CardTitle><CardDescription>Your top places to spend in {selectedMonthLabel}</CardDescription></CardHeader>
          <CardContent>
            {data.topMerchants.length ? (
              <div className="divide-y">
                {data.topMerchants.map((item) => (
                  <div key={item.merchant} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{item.merchant}</p><p className="text-xs text-muted-foreground">{item.count} purchase{item.count === 1 ? "" : "s"}</p></div>
                    <p className="shrink-0 font-mono text-sm tabular-nums">{formatCurrency(item.value)}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No spending in {selectedMonthLabel}.</p>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
