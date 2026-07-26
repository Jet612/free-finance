import type { Metadata } from "next";
import { Landmark, TrendingUp, WalletCards } from "lucide-react";

import { AccountTable } from "@/components/account-table";
import {
  NetWorthChart,
  SpendingChart,
} from "@/components/finance-charts";
import { MetricCard } from "@/components/metric-card";
import { RecentTransactions } from "@/components/recent-transactions";
import { SyncNowButton } from "@/components/sync-now-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardData } from "@/lib/data";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function DashboardPage() {
  const data = await getDashboardData();
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: process.env.APP_TIMEZONE ?? "America/New_York",
  }).format(new Date());

  return (
    <div className="grid gap-6 lg:gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
              Overview
            </span>
            {data.lastSuccessfulSync && (
              <Badge variant="secondary" className="font-normal">
                Synced {formatDateTime(data.lastSuccessfulSync)}
              </Badge>
            )}
          </div>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Your financial picture
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{today}</p>
        </div>
        <SyncNowButton
          configured={Boolean(
            process.env.GITHUB_SYNC_TOKEN &&
              process.env.GITHUB_SYNC_REPOSITORY,
          )}
          completedSyncAt={data.completedSyncAt}
          failedSyncAt={data.failedSyncAt}
        />
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Net worth"
          value={formatCurrency(data.metrics.netWorth)}
          detail={
            data.metrics.netWorthChange === null
              ? "Waiting for a second snapshot"
              : `${formatCurrency(Math.abs(data.metrics.netWorthChange))} since prior sync`
          }
          change={data.metrics.netWorthChange}
          icon={WalletCards}
        />
        <MetricCard
          title="Monthly cash flow"
          value={formatCurrency(data.metrics.monthlyCashFlow)}
          detail={`${formatCurrency(data.metrics.monthlyIncome)} in · ${formatCurrency(data.metrics.monthlySpending)} out`}
          change={data.metrics.monthlyCashFlow}
          icon={Landmark}
        />
        <MetricCard
          title="Investment value"
          value={formatCurrency(data.metrics.investmentValue)}
          detail="Stocks and crypto at current value"
          icon={TrendingUp}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle>Net worth trend</CardTitle>
            <CardDescription>
              Combined end-of-day account balances
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NetWorthChart data={data.trend} />
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>Last 30 days, cleared transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <SpendingChart data={data.spending} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <CardDescription>
              Current balance and connection health
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountTable accounts={data.accounts} />
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest cleared and pending activity</CardDescription>
          </CardHeader>
          <CardContent>
            <RecentTransactions transactions={data.recentTransactions} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
