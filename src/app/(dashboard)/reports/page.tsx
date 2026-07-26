import type { Metadata } from "next";
import { ChartNoAxesCombined, PiggyBank, TrendingDown, TrendingUp } from "lucide-react";

import { SpendingChart } from "@/components/finance-charts";
import { PageHeader } from "@/components/page-header";
import { CashFlowReportChart } from "@/components/report-charts";
import { SummaryStrip } from "@/components/summary-strip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getReportsData } from "@/lib/detail-data";
import { formatCurrency, formatPercent } from "@/lib/format";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const data = await getReportsData();
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Reports"
        title="Patterns over time"
        description="Six-month cash flow and a 90-day category view, calculated directly from cleared transactions."
      />
      <SummaryStrip
        items={[
          {
            label: "Average income",
            value: formatCurrency(data.metrics.averageIncome),
            detail: "Past 6 calendar months",
            icon: TrendingUp,
          },
          {
            label: "Average spending",
            value: formatCurrency(data.metrics.averageSpending),
            icon: TrendingDown,
          },
          {
            label: "Average net",
            value: formatCurrency(data.metrics.averageNet),
            icon: ChartNoAxesCombined,
            tone: data.metrics.averageNet >= 0 ? "positive" : "negative",
          },
          {
            label: "Savings rate",
            value: formatPercent(data.metrics.savingsRate),
            detail: "Income minus spending",
            icon: PiggyBank,
          },
        ]}
      />
      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Income vs. spending</CardTitle>
            <CardDescription>Six calendar months</CardDescription>
          </CardHeader>
          <CardContent>
            <CashFlowReportChart data={data.monthly} />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>Past 90 days</CardDescription>
          </CardHeader>
          <CardContent>
            <SpendingChart data={data.categories} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
