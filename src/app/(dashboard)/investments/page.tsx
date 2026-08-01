import type { Metadata } from "next";
import {
  ChartNoAxesCombined,
  CircleDollarSign,
  Landmark,
  TrendingUp,
} from "lucide-react";

import { InvestmentHistoryChart } from "@/components/investment-history-chart";
import { PageHeader } from "@/components/page-header";
import { SummaryStrip } from "@/components/summary-strip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getInvestmentsData } from "@/lib/detail-data";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Investments" };

export default async function InvestmentsPage() {
  const data = await getInvestmentsData();
  return (
    <div className="grid gap-7">
      <PageHeader title="Investments" />
      <section className="grid gap-3" aria-labelledby="overview-heading">
        <div>
          <h2 id="overview-heading" className="text-sm font-semibold">
            Overview
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            All investment accounts combined
          </p>
        </div>
        <SummaryStrip
          items={[
            {
              label: "Total investments",
              value: formatCurrency(data.metrics.value),
              icon: TrendingUp,
            },
            {
              label: "Cost basis",
              value: formatCurrency(data.metrics.costBasis),
              icon: CircleDollarSign,
            },
            {
              label: "Unrealized gain/loss",
              value: formatCurrency(data.metrics.gain),
              detail: `(${formatPercent(data.metrics.gainPercent)})`,
              icon: ChartNoAxesCombined,
              tone: data.metrics.gain >= 0 ? "positive" : "negative",
            },
            {
              label: "Accounts",
              value: String(data.metrics.accounts),
              detail: "Included in the combined total",
              icon: Landmark,
            },
          ]}
        />
      </section>

      <section className="grid gap-3" aria-labelledby="accounts-heading">
        <div>
          <h2 id="accounts-heading" className="text-sm font-semibold">
            Accounts
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each account shown separately
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {data.accounts.map((account) => (
            <Card key={account.id} className="shadow-none">
              <CardHeader className="border-b">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{account.name}</CardTitle>
                    <CardDescription className="mt-1 truncate">
                      {account.institutionName}
                      {account.mask ? ` · •••• ${account.mask}` : ""}
                    </CardDescription>
                  </div>
                  <p className="shrink-0 font-mono text-lg font-medium tabular-nums">
                    {formatCurrency(account.value)}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Cost basis
                    </p>
                    <p className="mt-2 font-mono text-sm font-medium tabular-nums">
                      {formatCurrency(account.costBasis)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Gain/loss
                    </p>
                    <p
                      className={cn(
                        "mt-2 font-mono text-sm font-medium tabular-nums",
                        account.gain >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400",
                      )}
                    >
                      {formatCurrency(account.gain)}
                      <span className="ml-2 text-xs font-normal">
                        ({formatPercent(account.gainPercent)})
                      </span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Gains and losses</CardTitle>
          <CardDescription>
            Total unrealized gain/loss across all investment accounts at each
            sync
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvestmentHistoryChart data={data.history} />
          <p className="mt-3 text-xs text-muted-foreground">
            Each point is market value minus cost basis, summed across accounts.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
