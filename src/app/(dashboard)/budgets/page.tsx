import type { Metadata } from "next";
import { CircleDollarSign, Gauge, PiggyBank, Target } from "lucide-react";

import { BudgetRowForm } from "@/components/budget-row-form";
import { PageHeader } from "@/components/page-header";
import { SummaryStrip } from "@/components/summary-strip";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getBudgetsData } from "@/lib/detail-data";
import { formatCurrency, formatPercent, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  const data = await getBudgetsData();
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Budgets"
        title="Plan the month, category by category"
        description="Set flexible monthly limits against the categories already coming from Plaid. Changes stay in your private Postgres database."
      />
      <SummaryStrip
        items={[
          {
            label: "Planned",
            value: formatCurrency(data.metrics.planned),
            icon: Target,
          },
          {
            label: "Spent against plan",
            value: formatCurrency(data.metrics.spent),
            icon: CircleDollarSign,
          },
          {
            label: "Remaining",
            value: formatCurrency(data.metrics.remaining),
            icon: PiggyBank,
            tone: data.metrics.remaining >= 0 ? "positive" : "negative",
          },
          {
            label: "Categories set",
            value: String(data.metrics.categoriesSet),
            detail: "Editable at any time",
            icon: Gauge,
          },
        ]}
      />
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Monthly category plan</CardTitle>
          <CardDescription>
            Transfer categories are excluded so credit-card payments are not
            counted twice.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {data.budgets.length ? (
            <div className="divide-y">
              {data.budgets.map((budget) => (
                <div
                  key={budget.category}
                  className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(180px,0.7fr)_minmax(220px,1.3fr)_150px_160px] lg:items-center"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {titleCase(budget.category)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatCurrency(budget.spent)} spent
                    </p>
                  </div>
                  <div>
                    {budget.monthlyLimit == null ? (
                      <div className="h-1.5 rounded-full bg-muted" />
                    ) : (
                      <>
                        <Progress
                          value={Math.min(budget.percent ?? 0, 100)}
                          className={cn(
                            "h-1.5",
                            (budget.percent ?? 0) >= 100 &&
                              "[&_[data-slot=progress-indicator]]:bg-red-500",
                            (budget.percent ?? 0) >= 80 &&
                              (budget.percent ?? 0) < 100 &&
                              "[&_[data-slot=progress-indicator]]:bg-amber-500",
                          )}
                        />
                        <p className="mt-1.5 text-[11px] text-muted-foreground">
                          {formatPercent(budget.percent)} used
                        </p>
                      </>
                    )}
                  </div>
                  <div className="lg:text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Remaining
                    </p>
                    <p
                      className={cn(
                        "mt-1 font-mono text-sm font-medium tabular-nums",
                        (budget.remaining ?? 0) < 0 &&
                          "text-red-600 dark:text-red-400",
                      )}
                    >
                      {budget.remaining == null
                        ? "Not set"
                        : formatCurrency(budget.remaining)}
                    </p>
                  </div>
                  <div className="lg:justify-self-end">
                    <BudgetRowForm
                      category={budget.category}
                      monthlyLimit={budget.monthlyLimit}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-52 items-center justify-center px-6 text-center">
              <div>
                <PiggyBank className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">
                  Categories appear after the first transaction sync
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
