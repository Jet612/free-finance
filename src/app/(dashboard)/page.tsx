import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  Landmark,
  TrendingUp,
} from "lucide-react";

import { NetWorthChart } from "@/components/finance-charts";
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
import { getDashboardData, type AccountRow } from "@/lib/data";
import {
  formatCurrency,
  formatDateTime,
  formatPercent,
  titleCase,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Overview",
};

type AccountGroup = {
  label: string;
  count: number;
  balance: number;
  icon: typeof Landmark;
  tone: string;
};

function groupAccounts(accounts: AccountRow[]): AccountGroup[] {
  const groups = new Map<string, AccountGroup>();
  for (const account of accounts) {
    const type = account.type.toLowerCase();
    const source = account.source.toLowerCase();
    const group =
      source === "robinhood" || type.includes("brokerage")
        ? {
            label: "Investments",
            icon: TrendingUp,
            tone: "bg-emerald-700 text-white",
          }
        : type.includes("credit")
          ? {
              label: "Credit cards",
              icon: CreditCard,
              tone: "bg-amber-500 text-white",
            }
          : type.includes("loan")
            ? {
                label: "Loans",
                icon: Landmark,
                tone: "bg-orange-500 text-white",
              }
            : {
                label: "Cash & banking",
                icon: Landmark,
                tone: "bg-primary text-primary-foreground",
              };
    const current = groups.get(group.label);
    groups.set(group.label, {
      ...group,
      count: (current?.count ?? 0) + 1,
      balance: (current?.balance ?? 0) + account.balance,
    });
  }
  return Array.from(groups.values()).sort((a, b) => b.balance - a.balance);
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const accountGroups = groupAccounts(data.accounts);
  const monthlyTotal =
    data.metrics.monthlyIncome + data.metrics.monthlySpending;
  const changePositive = (data.metrics.netWorthChange ?? 0) >= 0;

  return (
    <div className="grid gap-7 lg:gap-9">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              Overview
            </p>
            {data.lastSuccessfulSync && (
              <Badge variant="secondary" className="font-normal">
                Synced {formatDateTime(data.lastSuccessfulSync)}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            A simple view of everything you own, owe, earn, and spend.
          </p>
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

      <section aria-labelledby="net-worth-heading">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1
              id="net-worth-heading"
              className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              Net worth
            </h1>
            <p className="mt-3 font-mono text-[clamp(2.75rem,6vw,5.25rem)] font-medium leading-none tracking-[-0.065em] tabular-nums text-foreground">
              {formatCurrency(data.metrics.netWorth)}
            </p>
            {data.metrics.netWorthChange !== null && (
              <p
                className={cn(
                  "mt-3 text-sm font-medium",
                  changePositive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {changePositive ? "↑" : "↓"}{" "}
                {formatCurrency(Math.abs(data.metrics.netWorthChange))} (
                {formatPercent(
                  Math.abs(data.metrics.netWorthChangePercent ?? 0),
                  2,
                )}
                ){" "}
                <span className="font-normal text-muted-foreground">
                  past 90 days
                </span>
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:text-right">
            <div>
              <p className="text-xs text-muted-foreground">Cash flow</p>
              <p className="mt-1 font-mono font-medium tabular-nums">
                {formatCurrency(data.metrics.monthlyCashFlow)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Investments</p>
              <p className="mt-1 font-mono font-medium tabular-nums">
                {formatCurrency(data.metrics.investmentValue)}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 border-b pb-6">
          <NetWorthChart data={data.trend} />
        </div>
      </section>

      <section className="grid border-b xl:grid-cols-2">
        <div className="pb-7 xl:border-r xl:pr-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
              Accounts
            </h2>
            <Link
              href="/accounts"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="divide-y">
            {accountGroups.map((group) => (
              <div
                key={group.label}
                className="flex items-center gap-3 py-3 first:pt-1"
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full",
                    group.tone,
                  )}
                >
                  <group.icon className="size-4" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{group.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.count} account{group.count === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="font-mono text-sm font-medium tabular-nums">
                  {formatCurrency(group.balance)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-4 font-medium">
            <p>Total net worth</p>
            <p className="font-mono tabular-nums">
              {formatCurrency(data.metrics.netWorth)}
            </p>
          </div>
        </div>

        <div className="border-t py-7 xl:border-t-0 xl:pl-10">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
                Cash flow
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">This month</p>
            </div>
            <Link
              href="/reports"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Reports <ArrowRight className="size-3" />
            </Link>
          </div>
          <p className="font-mono text-2xl font-medium tracking-tight tabular-nums">
            {formatCurrency(data.metrics.monthlyCashFlow)}
            <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
              net
            </span>
          </p>
          <div className="mt-4 flex h-3 overflow-hidden rounded-sm bg-muted">
            <span
              className="bg-emerald-600"
              style={{
                width: `${
                  monthlyTotal
                    ? (data.metrics.monthlyIncome / monthlyTotal) * 100
                    : 0
                }%`,
              }}
            />
            <span className="flex-1 bg-amber-500" />
          </div>
          <div className="mt-5 divide-y">
            <div className="flex items-center justify-between py-3">
              <span className="flex items-center gap-2 text-sm">
                <span className="size-2 rounded-full bg-emerald-600" />
                Income
              </span>
              <span className="font-mono text-sm tabular-nums">
                {formatCurrency(data.metrics.monthlyIncome)}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="flex items-center gap-2 text-sm">
                <span className="size-2 rounded-full bg-amber-500" />
                Spending
              </span>
              <span className="font-mono text-sm tabular-nums">
                {formatCurrency(data.metrics.monthlySpending)}
              </span>
            </div>
            {data.spending.slice(0, 3).map((item) => (
              <div
                key={item.category}
                className="flex items-center justify-between py-2.5 text-xs text-muted-foreground"
              >
                <span>{titleCase(item.category)}</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription className="mt-1">
                Ordered by bank-provided time when available
              </CardDescription>
            </div>
            <Link
              href="/transactions"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              All transactions <ArrowRight className="size-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <RecentTransactions transactions={data.recentTransactions} />
        </CardContent>
      </Card>
    </div>
  );
}
