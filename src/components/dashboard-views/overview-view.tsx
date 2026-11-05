import type { ReactNode } from "react";
import Link from "next/link";
import { Landmark, TrendingUp, WalletCards } from "lucide-react";

import { ImportProgress } from "@/components/connection-controls";

import { BudgetMeter } from "@/components/budget-meter";
import { InsightList } from "@/components/insight-list";
import { MerchantIcon } from "@/components/merchant-icon";
import { Money, MoneyText } from "@/components/money";
import { NetWorthNote } from "@/components/net-worth-note";
import { PaceChart } from "@/components/pace-chart";
import { EmptyNote, Panel, SectionHeading } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Vital } from "@/components/vital";
import { categoryLabel } from "@/lib/categories";
import type { DashboardData, RecentTransaction } from "@/lib/data";
import {
  formatDateTime,
  formatDayHeading,
  formatLongDate,
  formatLongMonth,
  formatPercent,
  formatRelativeTime,
  formatShortDate,
} from "@/lib/format";
import { budgetState, type MonthPace, type Verdict } from "@/lib/insights";
import { staleSentence } from "@/lib/stale";
import { cn } from "@/lib/utils";

const VERDICT_TONE: Record<Verdict["tone"], string> = {
  good: "bg-positive",
  watch: "bg-warning-fill",
  urgent: "bg-negative",
};

function paceHeadline(pace: MonthPace): ReactNode {
  const spent = <>You&apos;ve spent <Money value={pace.spent} whole /> on everyday things.</>;
  if (pace.usualByNow === null) return spent;
  const difference = pace.spent - pace.usualByNow;
  if (Math.abs(difference) < Math.max(pace.usualByNow * 0.03, 10)) {
    return <>{spent} That&apos;s about usual.</>;
  }
  return (
    <>
      {spent} That&apos;s <Money value={Math.abs(difference)} whole />{" "}
      {difference < 0 ? "less" : "more"} than usual by now.
    </>
  );
}

function TransactionRow({
  transaction,
  href,
  today,
}: {
  transaction: RecentTransaction;
  href: string;
  today: string;
}) {
  const incoming = transaction.amount > 0;
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-2.5 outline-offset-[-2px] transition-colors hover:bg-accent/50"
      >
        <MerchantIcon
          src={transaction.logoUrl}
          category={transaction.category}
          categoryDetailed={transaction.categoryDetailed}
          incoming={incoming}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium leading-snug">
            {transaction.merchantName ?? transaction.name}
          </span>
          <span className="block truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
            {formatDayHeading(transaction.date, today)}, {categoryLabel(transaction.category).toLowerCase()}
            {transaction.pending && ", pending"}
          </span>
        </span>
        <Money
          value={transaction.amount}
          signed={incoming}
          className={cn("tnum shrink-0 text-[0.9375rem] font-medium", incoming && "text-positive")}
        />
      </Link>
    </li>
  );
}

function FirstRun({ href }: { href: (path: string) => string }) {
  const steps = [
    { icon: Landmark, title: "Connect your bank and cards", detail: "You sign in on Plaid's secure page, so your password never reaches this app." },
    { icon: TrendingUp, title: "Add your investments", detail: "Robinhood, Fidelity, and most other brokerages connect the same way." },
    { icon: WalletCards, title: "See where you stand", detail: "Net worth, spending, and upcoming bills appear here, and update every morning." },
  ];
  return (
    <div className="grid grid-cols-1 gap-8 pt-6">
      <div>
        <h1 className="wide text-[2rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.5rem]">
          Let&apos;s see where you stand
        </h1>
        <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-6 text-muted-foreground">
          Connect your first account and everything else fills in by itself. It takes about two minutes.
        </p>
        <Button asChild size="lg" className="mt-5 h-10 px-4">
          <Link href={href("/setup")}>Connect an account</Link>
        </Button>
      </div>
      <ol className="grid gap-6 sm:grid-cols-3">
        {steps.map((step) => (
          <li key={step.title}>
            <step.icon className="size-5 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
            <p className="mt-2 text-[0.9375rem] font-medium">{step.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.detail}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function OverviewView({
  data,
  syncAction,
  basePath = "",
  dismissed = [],
}: {
  data: DashboardData;
  syncAction: ReactNode;
  basePath?: string;
  dismissed?: string[];
}) {
  const href = (path: string) => `${basePath}${path}`;
  const { health, metrics, pace, verdict, vitals, today } = data;
  if (health.importing && !health.lastUpdatedAt) return <ImportProgress connectionsHref={href("/setup")} />;
  if (!health.hasConnections) return <FirstRun href={href} />;

  const monthName = formatLongMonth(today);
  const monthKey = today.slice(0, 7);
  const monthProgress = (pace.today / pace.daysInMonth) * 100;
  const budgets = data.budgets
    .filter((budget) => budget.monthlyLimit !== null)
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))
    .slice(0, 3);
  const updated = health.lastUpdatedAt ?? today;
  const outOfDate = health.attention.map((item) => item.institution);

  const finished = data.monthly
    .filter((item) => item.month.slice(0, 7) < monthKey && (item.income > 0 || item.spending > 0))
    .slice(-3);
  const threeMonthIncome = finished.reduce((sum, item) => sum + item.income, 0);
  const threeMonthSpending = finished.reduce((sum, item) => sum + item.spending, 0);
  const owed = vitals.cardBalances;
  const staleNote = outOfDate.length
    ? `${outOfDate.join(" and ")} ${outOfDate.length === 1 ? "is" : "are"} out of date, so this may be off.`
    : undefined;
  const onHold = data.breakdown.cash - metrics.cashOnHand;
  const heldNote =
    onHold >= 1 ? "Cash available leaves out what's on hold at your bank." : undefined;
  const shownBills = data.upcomingBills.reduce((sum, bill) => sum + bill.amount, 0);
  const moreBills = vitals.billsDueCount - data.upcomingBills.length;

  return (
    <div className="grid grid-cols-1 gap-7">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground">
          <p>{formatLongDate(today)}</p>
          <div className="flex items-center gap-2">
            <time dateTime={updated} title={`Last updated ${formatDateTime(updated)}`}>
              Updated {formatRelativeTime(updated)}
              {outOfDate.length > 0 && <>, except {outOfDate.join(" and ")}</>}
            </time>
            {syncAction}
          </div>
        </div>
        <h1 className="wide mt-2 flex items-center gap-3 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.125rem]">
          <span aria-hidden="true" className={cn("size-3 shrink-0 rounded-full", VERDICT_TONE[verdict.tone])} />
          {verdict.headline}
        </h1>
        <p className="mt-1.5 max-w-[68ch] text-[0.9375rem] leading-6 text-muted-foreground">
          <MoneyText value={verdict.detail} />
        </p>
        <p className="mt-2 text-[0.9375rem] font-medium lg:hidden">
          <Money value={metrics.netWorth} whole /> net worth,{" "}
          <Money value={vitals.cashAfterBills} whole /> left after bills and cards
        </p>
      </header>

      {/* Source order is priority order, so a phone and a screen reader both get what
          needs attention and what's due first. Wide screens lay it out in columns. */}
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="contents lg:col-start-2 lg:row-start-2 lg:grid lg:grid-cols-1 lg:content-start lg:gap-7">
        <section aria-labelledby="needs-heading" className="min-w-0">
          <SectionHeading title={<span id="needs-heading">Needs you</span>} />
          <InsightList insights={data.insights} initiallyDismissed={dismissed} basePath={basePath} />
        </section>
          <section aria-labelledby="coming-heading" className="min-w-0">
            <SectionHeading
              title={<span id="coming-heading">Coming up</span>}
              detail="Estimated from past charges"
              href={href("/subscriptions")}
              linkLabel="All bills"
            />
            <Panel className="overflow-hidden">
              {data.upcomingBills.length ? (
                <ul className="divide-y">
                  {data.upcomingBills.map((bill) => (
                    <li key={`${bill.merchant}-${bill.expectedAt}`}>
                      <Link
                        href={
                          bill.kind === "card"
                            ? href("/accounts")
                            : href(`/transactions?q=${encodeURIComponent(bill.merchant)}`)
                        }
                        className="flex items-center gap-3 px-4 py-2.5 outline-offset-[-2px] transition-colors hover:bg-accent/50"
                      >
                        <span className="w-14 shrink-0 text-[0.8125rem] font-medium text-muted-foreground">
                          {formatShortDate(bill.expectedAt)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">{bill.merchant}</span>
                        <Money value={bill.amount} className="tnum shrink-0 text-[0.9375rem]" />
                      </Link>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.9375rem] font-semibold">
                    <span>
                      {moreBills > 0 ? (
                        <>
                          Next 30 days, with {moreBills} more (<Money value={vitals.dueNext30Days - shownBills} whole />)
                        </>
                      ) : (
                        "Next 30 days"
                      )}
                    </span>
                    <Money value={vitals.dueNext30Days} className="tnum shrink-0" />
                  </li>
                </ul>
              ) : (
                <EmptyNote title="Nothing due in the next 30 days" detail="Bills and subscriptions show up here once they've repeated a few times." />
              )}
            </Panel>
          </section>
          <section aria-labelledby="budgets-heading" className="min-w-0">
            <SectionHeading title={<span id="budgets-heading">Budgets</span>} href={budgets.length ? href("/budgets") : undefined} linkLabel="All budgets" />
            <Panel className={budgets.length ? "grid gap-4 p-4" : undefined}>
              {budgets.length ? (
                budgets.map((budget) => (
                  <div key={budget.category}>
                    <div className="mb-2 flex items-baseline justify-between gap-3 text-[0.9375rem]">
                      <span className="truncate font-medium">{categoryLabel(budget.category)}</span>
                      <span className="shrink-0 text-[0.8125rem] text-muted-foreground">
                        {(budget.remaining ?? 0) >= 0 ? (
                          <><Money value={budget.remaining ?? 0} whole /> left</>
                        ) : (
                          <span className="font-medium text-negative">
                            <Money value={Math.abs(budget.remaining ?? 0)} whole /> over
                          </span>
                        )}
                      </span>
                    </div>
                    <BudgetMeter
                      percent={budget.percent ?? 0}
                      monthProgress={monthProgress}
                      state={budgetState(budget.percent, monthProgress)}
                      label={`${categoryLabel(budget.category)} budget used`}
                    />
                  </div>
                ))
              ) : (
                <EmptyNote
                  title="No budgets yet"
                  detail="Set one from what you usually spend."
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link href={href("/budgets")}>Set a budget</Link>
                    </Button>
                  }
                />
              )}
            </Panel>
          </section>
        </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:col-span-2 lg:row-start-1 lg:grid-cols-4">
        <Vital
          label="After bills and cards"
          value={<Money value={vitals.cashAfterBills} whole />}
          detail="Cash left after cards and the next 30 days of bills"
          lines={[
            { label: "Cash available", value: metrics.cashOnHand },
            { label: "Card balances", value: vitals.cardBalances, subtract: true },
            { label: "Bills, next 30 days", value: vitals.billsNext30Days, subtract: true },
          ]}
          result={<><span>Left over</span><Money value={vitals.cashAfterBills} className="tnum" /></>}
          note={[heldNote, staleNote].filter(Boolean).join(" ") || undefined}
          href={href("/subscriptions")}
          linkLabel="See what's due"
        />
        <Vital
          label="Savings rate"
          value={vitals.savingsRate === null ? "Not yet" : formatPercent(vitals.savingsRate, 0)}
          detail={vitals.savingsRate === null ? "Appears after a full month of income" : "Of your income kept, last 3 months"}
          lines={
            vitals.savingsRate === null
              ? undefined
              : [
                  { label: "Income", value: threeMonthIncome },
                  { label: "Spending", value: threeMonthSpending, subtract: true },
                ]
          }
          result={
            vitals.savingsRate === null ? undefined : (
              <><span>Kept</span><span className="tnum">{formatPercent(vitals.savingsRate, 0)}</span></>
            )
          }
          note={`Over the last ${finished.length === 1 ? "finished month" : `${finished.length} finished months`}. The month in progress isn't counted.`}
          href={href("/reports")}
          linkLabel="See spending"
        />
        <Vital
          label="Emergency cushion"
          value={vitals.cushionMonths === null ? "Not yet" : `${vitals.cushionMonths.toFixed(1)} months`}
          detail={vitals.cushionMonths === null ? "Appears after a full month of spending" : "How long your cash lasts at normal spending"}
          lines={
            vitals.averageSpending === null
              ? undefined
              : [
                  { label: "Cash available", value: metrics.cashOnHand },
                  { label: "Usual month", value: vitals.averageSpending },
                ]
          }
          note="Your cash divided by a usual month of spending. Three to six months is a common goal."
          href={href("/accounts")}
          linkLabel="See your accounts"
        />
        <Vital
          label="Credit used"
          value={vitals.creditUtilization === null ? "None" : formatPercent(vitals.creditUtilization, 0)}
          detail={vitals.creditUtilization === null ? "No credit limits shared yet" : "Of your card limits. Under 30% is healthy"}
          lines={
            vitals.creditLimit === null
              ? undefined
              : [
                  { label: "You owe", value: owed },
                  { label: "Total limits", value: vitals.creditLimit },
                ]
          }
          note={staleNote ?? "What you owe across your cards, as a share of their limits. It's a big part of your credit score."}
          href={href("/accounts")}
          linkLabel="See your cards"
        />
      </div>
        <div className="contents lg:col-start-1 lg:row-start-2 lg:grid lg:grid-cols-1 lg:content-start lg:gap-7">
        <div className="min-w-0">
          <NetWorthNote
            netWorth={metrics.netWorth}
            trend={data.trend}
            breakdown={data.breakdown}
          />
        </div>
        <section aria-labelledby="month-heading" className="min-w-0">
          <Panel className="p-5 sm:p-6">
            <p className="text-[0.8125rem] text-muted-foreground">{monthName} so far</p>
            <h2
              id="month-heading"
              className="semiwide mt-1 text-[1.375rem] font-semibold leading-tight tracking-[-0.015em] sm:text-[1.625rem]"
            >
              {paceHeadline(pace)}
            </h2>
            <div className="mt-5">
              <PaceChart pace={pace} month={monthKey} />
            </div>
            <p className="mt-2 text-[0.8125rem] leading-5 text-muted-foreground">
              Everyday means everything except rent, bills, and subscriptions, which land on set days.
            </p>
            {health.attention.length > 0 && (
              <p className="mt-1 text-[0.8125rem] leading-5 text-warning">
                {staleSentence(
                  health.attention.map((item) => ({
                    institution: item.institution,
                    lastSuccessAt: item.lastSuccessAt,
                  })),
                )}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t pt-4">
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <dt className="text-[0.8125rem] text-muted-foreground">All spending so far</dt>
                <dd className="mt-0.5 text-[0.9375rem] font-semibold">
                  <Money value={data.allSpending.spent} whole />
                </dd>
              </div>
              <div>
                <dt className="text-[0.8125rem] text-muted-foreground">Likely month total</dt>
                <dd className="mt-0.5 text-[0.9375rem] font-semibold">
                  {data.allSpending.projected === null ? "Not enough history" : <Money value={data.allSpending.projected} whole />}
                </dd>
              </div>
              <div>
                <dt className="text-[0.8125rem] text-muted-foreground">Income so far</dt>
                <dd className="mt-0.5 text-[0.9375rem] font-semibold">
                  <Money value={metrics.monthlyIncome} whole />
                  {data.allSpending.expectedIncome !== null &&
                    data.allSpending.expectedIncome > metrics.monthlyIncome && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        of about <Money value={data.allSpending.expectedIncome} whole />
                      </span>
                    )}
                </dd>
              </div>
            </dl>
            <Link href={href("/reports")} className="text-[0.8125rem] font-medium underline underline-offset-3">
              See the breakdown
            </Link>
            </div>
          </Panel>
        </section>
        <section aria-labelledby="recent-heading" className="min-w-0">
          <SectionHeading title={<span id="recent-heading">Recent activity</span>} href={href("/transactions")} linkLabel="All transactions" />
          <Panel className="overflow-hidden">
            {data.recentTransactions.length ? (
              <ul className="divide-y">
                {data.recentTransactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    today={today}
                    href={href(`/transactions?open=${transaction.id}`)}
                  />
                ))}
              </ul>
            ) : (
              <EmptyNote title="No transactions yet" detail="They'll appear here after your accounts finish importing." />
            )}
          </Panel>
        </section>
        </div>
      </div>
    </div>
  );
}
