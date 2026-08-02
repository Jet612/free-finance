import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CreditCard, Landmark, PiggyBank, TrendingUp } from "lucide-react";

import { NetWorthChart } from "@/components/finance-charts";
import { PageHeader } from "@/components/page-header";
import { RecentTransactions } from "@/components/recent-transactions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountRow, DashboardData } from "@/lib/data";
import { formatCurrency, formatDateTime, formatPercent, formatRelativeTime, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

type AccountGroup = { label: string; count: number; balance: number; icon: typeof Landmark; tone: string };

const accountGroupDefinitions = [
  { label: "Checking", icon: Landmark, tone: "bg-primary text-primary-foreground" },
  { label: "Savings", icon: PiggyBank, tone: "bg-cyan-700 text-white" },
  { label: "Credit Cards", icon: CreditCard, tone: "bg-amber-500 text-white" },
  { label: "Investments", icon: TrendingUp, tone: "bg-emerald-700 text-white" },
] as const;

function groupAccounts(accounts: AccountRow[]): AccountGroup[] {
  const groups = new Map(accountGroupDefinitions.map((group) => [group.label, { ...group, count: 0, balance: 0 }]));
  for (const account of accounts) {
    const type = account.type.toLowerCase();
    const source = account.source.toLowerCase();
    const label = source === "robinhood" || ["brokerage", "investment", "managed", "ira"].some((value) => type.includes(value))
      ? "Investments"
      : type.includes("savings")
        ? "Savings"
        : type.includes("credit") || type.includes("loan")
          ? "Credit Cards"
          : "Checking";
    const current = groups.get(label);
    if (current) groups.set(label, { ...current, count: current.count + 1, balance: current.balance + account.balance });
  }
  return Array.from(groups.values()).filter((group) => group.count > 0);
}

export function OverviewView({
  data,
  syncAction,
  basePath = "",
}: {
  data: DashboardData;
  syncAction: ReactNode;
  basePath?: string;
}) {
  const accountGroups = groupAccounts(data.accounts);
  const monthlyTotal = data.metrics.monthlyIncome + data.metrics.monthlySpending;
  const changePositive = (data.metrics.netWorthChange ?? 0) >= 0;
  const lastSuccessfulSyncExact = data.lastSuccessfulSync ? formatDateTime(data.lastSuccessfulSync) : null;
  const href = (path: string) => `${basePath}${path}`;

  return (
    <div className="grid gap-7 lg:gap-9">
      <PageHeader
        title="Overview"
        action={<div className="flex items-center gap-3 text-xs">{data.lastSuccessfulSync && <time dateTime={data.lastSuccessfulSync} title={`Last synced ${lastSuccessfulSyncExact}`} aria-label={`Last synced ${lastSuccessfulSyncExact}`} className="cursor-help text-muted-foreground">Synced {formatRelativeTime(data.lastSuccessfulSync)}</time>}{syncAction}</div>}
      />
      <section aria-labelledby="net-worth-heading">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 id="net-worth-heading" className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Net worth</h2>
            <p className="mt-3 font-mono text-[clamp(2.75rem,6vw,5.25rem)] font-medium leading-none tracking-[-0.065em] tabular-nums text-foreground">{formatCurrency(data.metrics.netWorth)}</p>
            {data.metrics.netWorthChange !== null && <p className={cn("mt-3 text-sm font-medium", changePositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>{changePositive ? "↑" : "↓"} {formatCurrency(Math.abs(data.metrics.netWorthChange))} ({formatPercent(Math.abs(data.metrics.netWorthChangePercent ?? 0), 2)}) <span className="font-normal text-muted-foreground">past 90 days</span></p>}
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:text-right"><div><p className="text-xs text-muted-foreground">Cash flow</p><p className="mt-1 font-mono font-medium tabular-nums">{formatCurrency(data.metrics.monthlyCashFlow)}</p></div><div><p className="text-xs text-muted-foreground">Investments</p><p className="mt-1 font-mono font-medium tabular-nums">{formatCurrency(data.metrics.investmentValue)}</p></div></div>
        </div>
        <div className="mt-5 border-b pb-6"><NetWorthChart data={data.trend} /></div>
      </section>
      <section className="grid border-b xl:grid-cols-2">
        <div className="pb-7 xl:border-r xl:pr-10">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-[0.14em]">Accounts</h2><Link href={href("/accounts")} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">View all <ArrowRight className="size-3" /></Link></div>
          <div className="divide-y">{accountGroups.map((group) => <div key={group.label} className="flex items-center gap-3 py-3 first:pt-1"><span className={cn("flex size-9 items-center justify-center rounded-full", group.tone)}><group.icon className="size-4" strokeWidth={1.8} /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{group.label}</p><p className="text-xs text-muted-foreground">{group.count} account{group.count === 1 ? "" : "s"}</p></div><p className="font-mono text-sm font-medium tabular-nums">{formatCurrency(group.balance)}</p></div>)}</div>
          <div className="mt-2 flex items-center justify-between border-t pt-4 font-medium"><p>Total net worth</p><p className="font-mono tabular-nums">{formatCurrency(data.metrics.netWorth)}</p></div>
        </div>
        <div className="border-t py-7 xl:border-t-0 xl:pl-10">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold uppercase tracking-[0.14em]">Cash flow</h2><p className="mt-1 text-xs text-muted-foreground">This month</p></div><Link href={href("/reports")} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Spending <ArrowRight className="size-3" /></Link></div>
          <p className="font-mono text-2xl font-medium tracking-tight tabular-nums">{formatCurrency(data.metrics.monthlyCashFlow)}<span className="ml-2 font-sans text-xs font-normal text-muted-foreground">net</span></p>
          <div className="mt-4 flex h-3 overflow-hidden rounded-sm bg-muted" aria-label={`Income ${formatCurrency(data.metrics.monthlyIncome)}, spending ${formatCurrency(data.metrics.monthlySpending)}`}>{monthlyTotal > 0 && <><span className="bg-emerald-600" style={{ width: `${(data.metrics.monthlyIncome / monthlyTotal) * 100}%` }} /><span className="flex-1 bg-amber-500" /></>}</div>
          <div className="mt-5 divide-y"><div className="flex items-center justify-between py-3"><span className="flex items-center gap-2 text-sm"><span className="size-2 rounded-full bg-emerald-600" />Income</span><span className="font-mono text-sm tabular-nums">{formatCurrency(data.metrics.monthlyIncome)}</span></div><div className="flex items-center justify-between py-3"><span className="flex items-center gap-2 text-sm"><span className="size-2 rounded-full bg-amber-500" />Spending</span><span className="font-mono text-sm tabular-nums">{formatCurrency(data.metrics.monthlySpending)}</span></div>{data.spending.slice(0, 3).map((item) => <div key={item.category} className="flex items-center justify-between py-2.5 text-xs text-muted-foreground"><span>{titleCase(item.category)}</span><span className="font-mono tabular-nums">{formatCurrency(item.value)}</span></div>)}</div>
        </div>
      </section>
      <Card className="shadow-none"><CardHeader className="border-b"><div className="flex items-center justify-between"><div><CardTitle>Recent activity</CardTitle><CardDescription className="mt-1">Ordered by bank-provided time when available</CardDescription></div><Link href={href("/transactions")} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">All transactions <ArrowRight className="size-3" /></Link></div></CardHeader><CardContent><RecentTransactions transactions={data.recentTransactions} /></CardContent></Card>
    </div>
  );
}
