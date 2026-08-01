import type { Metadata } from "next";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  Tags,
} from "lucide-react";

import { SpendingChart } from "@/components/finance-charts";
import { PageHeader } from "@/components/page-header";
import { MonthlyCashFlowChart } from "@/components/report-charts";
import { SpendingMonthSelect } from "@/components/spending-month-select";
import { SummaryStrip } from "@/components/summary-strip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSpendingData } from "@/lib/detail-data";
import { formatCurrency, formatMonth, titleCase } from "@/lib/format";

export const metadata: Metadata = { title: "Spending" };

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedMonth =
    typeof params.month === "string" ? params.month : undefined;
  const data = await getSpendingData(requestedMonth);
  const selectedMonthLabel = formatMonth(data.selectedMonth);
  return (
    <div className="grid gap-7">
      <PageHeader
        title="Spending"
        action={
          <SpendingMonthSelect
            months={data.availableMonths}
            selectedMonth={data.selectedMonth}
          />
        }
      />
      <SummaryStrip
        items={[
          {
            label: "Income",
            value: formatCurrency(data.metrics.income),
            detail: selectedMonthLabel,
            icon: ArrowDownToLine,
          },
          {
            label: "Spent",
            value: formatCurrency(data.metrics.spending),
            detail: selectedMonthLabel,
            icon: ArrowUpFromLine,
          },
          {
            label: "Net income",
            value: formatCurrency(data.metrics.net),
            detail: `Income minus spending · ${selectedMonthLabel}`,
            icon: Scale,
            tone: data.metrics.net >= 0 ? "positive" : "negative",
          },
          {
            label: "Top category",
            value: data.metrics.topCategory
              ? titleCase(data.metrics.topCategory.category)
              : "—",
            detail: data.metrics.topCategory
              ? `${formatCurrency(data.metrics.topCategory.value)} in ${selectedMonthLabel}`
              : "No cleared spending",
            icon: Tags,
          },
        ]}
      />
      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.4fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>{selectedMonthLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <SpendingChart data={data.categories} />
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Income vs spending</CardTitle>
            <CardDescription>
              Six calendar months ending {selectedMonthLabel}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyCashFlowChart data={data.monthly} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
