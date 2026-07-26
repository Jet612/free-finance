import type { Metadata } from "next";
import { CalendarClock, CircleDollarSign, Repeat2, Sparkles } from "lucide-react";

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
import { getSubscriptionsData } from "@/lib/detail-data";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const data = await getSubscriptionsData();
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Subscriptions"
        title="Recurring charges, surfaced"
        description="A private heuristic detects consistent merchant, amount, and timing patterns without sending transaction data to another service."
      />
      <SummaryStrip
        items={[
          {
            label: "Monthly estimate",
            value: formatCurrency(data.metrics.monthlyEstimate),
            icon: Repeat2,
          },
          {
            label: "Annual estimate",
            value: formatCurrency(data.metrics.annualEstimate),
            icon: CircleDollarSign,
          },
          {
            label: "Expected next 30 days",
            value: formatCurrency(data.metrics.dueNext30Days),
            icon: CalendarClock,
          },
          {
            label: "Detected",
            value: `${data.metrics.detected} recurring`,
            detail: "Review before acting",
            icon: Sparkles,
          },
        ]}
      />
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Detected subscriptions</CardTitle>
          <CardDescription>
            Estimates improve as more transaction history accumulates.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {data.subscriptions.length ? (
            <div className="divide-y">
              {data.subscriptions.map((subscription) => (
                <div
                  key={`${subscription.merchant}-${subscription.cadence}`}
                  className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(120px,0.35fr))] sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Repeat2 className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {subscription.merchant}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {titleCase(subscription.category)} ·{" "}
                        {subscription.occurrences} matching charges
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Amount
                    </p>
                    <p className="mt-1 font-mono text-sm font-medium tabular-nums">
                      {formatCurrency(subscription.averageAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Next expected
                    </p>
                    <p className="mt-1 text-sm">
                      {formatDate(subscription.nextExpectedAt)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:block">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Cadence
                      </p>
                      <p className="mt-1 text-sm">{subscription.cadence}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className="mt-2 font-normal text-[10px]"
                    >
                      {subscription.confidence}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-56 items-center justify-center px-6 text-center">
              <div>
                <Repeat2 className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">
                  No recurring charges detected yet
                </p>
                <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
                  Two or more consistent charges are required. Annual matches
                  need enough history to see a repeat.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
