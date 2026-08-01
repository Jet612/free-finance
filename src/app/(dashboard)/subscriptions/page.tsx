import type { Metadata } from "next";
import {
  CalendarClock,
  CircleDollarSign,
  EyeOff,
  Repeat2,
  Sparkles,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SubscriptionAddForm } from "@/components/subscription-add-form";
import { SubscriptionRuleButton } from "@/components/subscription-rule-button";
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
      <PageHeader title="Subscriptions" />
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
      <SubscriptionAddForm transactions={data.transactionChoices} />
      <Card className="shadow-none">
        <CardHeader className="border-b">
          <CardTitle>Detected subscriptions</CardTitle>
          <CardDescription>
            Active estimates only. Rent, loans, transfers, usage-based
            household bills, and ordinary repeat purchases are excluded.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {data.subscriptions.length ? (
            <div className="divide-y">
              {data.subscriptions.map((subscription) => (
                <div
                  key={subscription.streamKey}
                  className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(210px,1fr)_repeat(3,minmax(110px,0.32fr))_auto] sm:items-center"
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
                        {subscription.source === "Manual"
                          ? "Added manually"
                          : `${subscription.occurrences} recent matching charges`}
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
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Last {formatDate(subscription.lastChargedAt)}
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
                  <div className="sm:justify-self-end">
                    {subscription.source === "Automatic" ? (
                      <SubscriptionRuleButton
                        mode="dismiss"
                        streamKey={subscription.streamKey}
                      />
                    ) : subscription.ruleId ? (
                      <SubscriptionRuleButton
                        mode="remove"
                        ruleId={subscription.ruleId}
                      />
                    ) : null}
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
                  At least three recent, tightly matched charges are required.
                  Annual subscriptions need two yearly renewals.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {data.dismissed.length > 0 && (
        <Card className="shadow-none">
          <CardHeader className="border-b">
            <CardTitle>Dismissed matches</CardTitle>
            <CardDescription>
              These streams stay hidden from automatic detection until you
              restore them.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="divide-y">
              {data.dismissed.map((subscription) => (
                <div
                  key={subscription.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <EyeOff className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {subscription.merchant}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {titleCase(subscription.category)}
                      </p>
                    </div>
                  </div>
                  <SubscriptionRuleButton
                    mode="restore"
                    ruleId={subscription.id}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
