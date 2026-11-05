import type { ReactNode } from "react";
import { ChartNoAxesCombined, CircleDollarSign, Landmark, TrendingUp } from "lucide-react";

import { HoldingsTable } from "@/components/holdings-table";
import {
  HoldingsValueChart,
  InvestmentAllocationChart,
} from "@/components/investment-charts";
import { InvestmentHistoryChart } from "@/components/investment-history-chart";
import { PageHeader } from "@/components/page-header";
import { SummaryStrip } from "@/components/summary-strip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { InvestmentsData } from "@/lib/detail-data";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const NOT_SHARED = "Not shared";

function gainTone(gain: number | null) {
  if (gain === null) return "default" as const;
  return gain >= 0 ? ("positive" as const) : ("negative" as const);
}

export function InvestmentsView({
  data,
  emptyAction,
}: {
  data: InvestmentsData;
  emptyAction?: ReactNode;
}) {
  if (!data.accounts.length) {
    return (
      <div className="grid gap-7">
        <PageHeader title="Investments" />
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">No investment accounts yet</CardTitle>
            <CardDescription>
              Connect Robinhood, Fidelity, or another brokerage through Plaid to
              see your holdings, gains, and how your money is spread out.
            </CardDescription>
          </CardHeader>
          {emptyAction && <CardContent>{emptyAction}</CardContent>}
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-7">
      <PageHeader title="Investments" />
      <section className="grid gap-3" aria-labelledby="overview-heading">
        <div><h2 id="overview-heading" className="text-sm font-semibold">Overview</h2><p className="mt-1 text-xs text-muted-foreground">All investment accounts combined</p></div>
        <SummaryStrip items={[
          { label: "Total investments", value: formatCurrency(data.metrics.value), icon: TrendingUp },
          { label: "What you paid", value: data.metrics.costBasis === null ? NOT_SHARED : formatCurrency(data.metrics.costBasis), detail: "Your cost basis", icon: CircleDollarSign },
          { label: "Gain or loss so far", value: data.metrics.gain === null ? NOT_SHARED : formatCurrency(data.metrics.gain), detail: data.metrics.gain === null ? "Your brokerage doesn't share this" : data.metrics.gainIsPartial ? `(${formatPercent(data.metrics.gainPercent)}) · partial, see below` : `(${formatPercent(data.metrics.gainPercent)})`, icon: ChartNoAxesCombined, tone: gainTone(data.metrics.gain) },
          { label: "Accounts", value: String(data.metrics.accounts), detail: "Included in the combined total", icon: Landmark },
        ]} />
        {data.metrics.gainIsPartial && data.metrics.gain !== null && (
          <p className="text-xs leading-5 text-muted-foreground">
            Some brokerages don&apos;t share what you originally paid. Gain and loss
            only include the holdings where that&apos;s known.
          </p>
        )}
      </section>

      {data.holdings.length > 0 && (
        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="shadow-none">
            <CardHeader><CardTitle>How your money is spread</CardTitle><CardDescription>By type of investment</CardDescription></CardHeader>
            <CardContent><InvestmentAllocationChart data={data.allocation} /></CardContent>
          </Card>
          <Card className="shadow-none">
            <CardHeader><CardTitle>Largest holdings</CardTitle><CardDescription>By current value</CardDescription></CardHeader>
            <CardContent><HoldingsValueChart data={data.holdings.map((holding) => ({ symbol: holding.symbol, currentValue: holding.value, unrealizedGain: holding.gain, unrealizedGainPercent: holding.gainPercent }))} /></CardContent>
          </Card>
        </section>
      )}

      <section className="grid gap-3" aria-labelledby="accounts-heading">
        <div><h2 id="accounts-heading" className="text-sm font-semibold">Accounts</h2><p className="mt-1 text-xs text-muted-foreground">Each account shown separately</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          {data.accounts.map((account) => (
            <Card key={account.id} className="shadow-none">
              <CardHeader className="border-b"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><CardTitle className="truncate">{account.name}</CardTitle><CardDescription className="mt-1 truncate">{account.institutionName}{account.mask ? ` · •••• ${account.mask}` : ""}</CardDescription></div><p className="shrink-0 font-mono text-lg font-medium tabular-nums">{formatCurrency(account.value)}</p></div></CardHeader>
              <CardContent><div className="grid grid-cols-2 gap-6"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">What you paid</p><p className="mt-2 font-mono text-sm font-medium tabular-nums">{account.costBasis === null ? NOT_SHARED : formatCurrency(account.costBasis)}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Gain/loss</p><p className={cn("mt-2 font-mono text-sm font-medium tabular-nums", account.gain !== null && (account.gain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"))}>{account.gain === null ? NOT_SHARED : <>{formatCurrency(account.gain)}<span className="ml-2 text-xs font-normal">({formatPercent(account.gainPercent)})</span></>}</p></div></div></CardContent>
            </Card>
          ))}
        </div>
      </section>

      {data.holdings.length > 0 && (
        <section className="grid gap-3" aria-labelledby="holdings-heading">
          <div><h2 id="holdings-heading" className="text-sm font-semibold">Holdings</h2><p className="mt-1 text-xs text-muted-foreground">Everything you own, combined across accounts</p></div>
          <HoldingsTable holdings={data.holdings} />
        </section>
      )}

      <Card className="shadow-none">
        <CardHeader className="border-b"><CardTitle>Gains and losses over time</CardTitle><CardDescription>Your total gain or loss at each daily update</CardDescription></CardHeader>
        <CardContent><InvestmentHistoryChart data={data.history} /><p className="mt-3 text-xs text-muted-foreground">Each point is what your investments were worth minus what you paid for them.</p></CardContent>
      </Card>
    </div>
  );
}
