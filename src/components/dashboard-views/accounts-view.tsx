import type { ReactNode } from "react";
import Link from "next/link";

import { AccountRowActions, AddManualAccount } from "@/components/account-actions";
import { Sparkline } from "@/components/charts/sparkline";
import { Money } from "@/components/money";
import { NetWorthNote } from "@/components/net-worth-note";
import { EmptyNote, Panel, SectionHeading } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { AccountRow } from "@/lib/data";
import type { NetWorthBreakdown } from "@/lib/dashboard-summary";
import type { AccountsData } from "@/lib/detail-data";
import { formatPercent, formatRelativeTime, formatShortDate } from "@/lib/format";
import { creditUtilization } from "@/lib/insights";
import { cn } from "@/lib/utils";

type Group = { key: string; label: string; accounts: AccountRow[] };

function groupAccounts(accounts: AccountRow[]): Group[] {
  const groups: Group[] = [
    { key: "depository", label: "Cash", accounts: [] },
    { key: "investment", label: "Investments", accounts: [] },
    { key: "credit", label: "Credit cards", accounts: [] },
    { key: "loan", label: "Loans", accounts: [] },
    { key: "other", label: "Other assets", accounts: [] },
  ];
  for (const account of accounts) {
    const group =
      groups.find((item) => item.key === account.accountType) ?? groups.at(-1)!;
    group.accounts.push(account);
  }
  return groups
    .filter((group) => group.accounts.length)
    .map((group) => ({
      ...group,
      accounts: [...group.accounts].sort(
        (a, b) => Math.abs(b.balance) - Math.abs(a.balance),
      ),
    }));
}

function breakdownOf(allAccounts: AccountRow[]): NetWorthBreakdown {
  const accounts = allAccounts.filter((item) => item.inNetWorth !== false);
  const total = (type: string) =>
    accounts
      .filter((item) => item.accountType === type)
      .reduce((sum, item) => sum + item.balance, 0);
  const known = ["depository", "investment", "credit", "loan"];
  return {
    cash: total("depository"),
    investments: total("investment"),
    credit: total("credit"),
    loans: total("loan"),
    other: accounts
      .filter((item) => !known.includes(item.accountType))
      .reduce((sum, item) => sum + item.balance, 0),
  };
}

/** A row that goes somewhere is a link. One you added has nowhere to go. */
function RowBody({
  href,
  className,
  children,
}: {
  href: string | null;
  className: string;
  children: ReactNode;
}) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

function AccountLine({
  account,
  href,
  demo,
}: {
  account: AccountRow;
  href: string;
  demo: boolean;
}) {
  const usage =
    account.accountType === "credit"
      ? creditUtilization([
          {
            name: account.name,
            owed: Math.abs(account.balance),
            available: account.availableBalance ?? null,
          },
        ])
      : null;
  const history = account.history ?? [];
  const change = account.change30Days ?? null;
  const included = account.inNetWorth !== false;
  const manual = account.source === "manual";

  return (
    <li className={cn("flex items-center transition-colors", !manual && "hover:bg-accent/50")}>
      <RowBody
        href={manual ? null : href}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-4 px-4 py-3 outline-offset-[-2px]",
          !included && "opacity-60",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-medium leading-snug">
            {account.name}
          </span>
          <span className="block truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
            {account.institutionName}
            {account.mask && <> ending {account.mask}</>}
            {!included && ", left out of your totals"}
          </span>
        </span>
        {history.length > 1 && (
          <Sparkline
            values={history.map((point) => point.value)}
            className="hidden w-24 md:block"
          />
        )}
        <span className="shrink-0 text-right sm:w-36">
          <Money value={account.balance} className="tnum block text-[0.9375rem] font-medium" />
          <span className="block text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
            {account.outOfDate ? (
              <span className="font-medium text-negative">
                {account.lastSyncedAt ? `Last good ${formatShortDate(account.lastSyncedAt)}` : "Out of date"}, reconnect
              </span>
            ) : usage !== null ? (
              <>{formatPercent(usage, 0)} of limit used</>
            ) : change !== null && Math.abs(change) >= 1 ? (
              <>
                <Money value={change} signed whole /> in 30 days
              </>
            ) : manual ? (
              `Updated ${formatShortDate(account.lastSyncedAt ?? "")}`
            ) : (
              "No change in 30 days"
            )}
          </span>
        </span>
      </RowBody>
      {!demo && (
        <AccountRowActions
          id={account.id}
          name={account.name}
          included={included}
          manual={manual}
          value={account.balance}
        />
      )}
    </li>
  );
}

export function AccountsView({
  data,
  basePath = "",
  demo = false,
}: {
  data: AccountsData;
  basePath?: string;
  demo?: boolean;
}) {
  const groups = groupAccounts(data.accounts);
  const cash = breakdownOf(data.accounts).cash;
  const onHold = cash - data.metrics.availableCash;
  const syncedAt = data.accounts
    .map((account) => account.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  if (!data.accounts.length) {
    return (
      <div className="pt-6">
        <h1 className="wide mb-4 text-[1.75rem] font-semibold tracking-[-0.02em]">Net worth</h1>
        <Panel>
          <EmptyNote
            title="No accounts yet"
            detail="Connect a bank or brokerage to see your balances here."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href={`${basePath}/setup`}>Connect an account</Link>
                </Button>
                <AddManualAccount demo={demo} />
              </div>
            }
          />
        </Panel>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 pt-6">
      <NetWorthNote
        heading="h1"
        netWorth={data.metrics.netWorth}
        trend={data.trend}
        breakdown={breakdownOf(data.accounts)}
        outOfDate={[
          ...new Set(
            data.accounts
              .filter((account) => account.outOfDate)
              .map((account) => account.institutionName),
          ),
        ]}
      />

      <p className="-mt-2 text-[0.9375rem] leading-6 text-muted-foreground">
        You own <Money value={data.metrics.assets} whole /> and owe{" "}
        <Money value={data.metrics.liabilities} whole />. Of your{" "}
        <Money value={cash} whole /> in cash, <Money value={data.metrics.availableCash} whole /> is available now
        {onHold >= 1 && (
          <>
            {" "}
            and <Money value={onHold} whole /> is on hold
          </>
        )}
        .
      </p>

      <div className="grid grid-cols-1 gap-8">
        {groups.map((group) => {
          const total = group.accounts
            .filter((item) => item.inNetWorth !== false)
            .reduce((sum, item) => sum + item.balance, 0);
          return (
            <section key={group.key} aria-label={group.label}>
              <SectionHeading
                title={
                  <span className="flex items-baseline gap-2">
                    {group.label}
                    <Money value={total} whole className="text-[0.9375rem] font-medium text-muted-foreground" />
                  </span>
                }
              />
              <Panel className={cn("overflow-hidden")}>
                <ul className="divide-y">
                  {group.accounts.map((account) => (
                    <AccountLine
                      key={account.id}
                      account={account}
                      demo={demo}
                      href={
                        account.outOfDate
                          ? `${basePath}/setup`
                          : account.accountType === "investment"
                            ? `${basePath}/investments`
                            : `${basePath}/transactions?account=${encodeURIComponent(account.name)}`
                      }
                    />
                  ))}
                </ul>
              </Panel>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {syncedAt && (
          <p className="text-[0.8125rem] text-muted-foreground">
            Most recent update {formatRelativeTime(syncedAt)}. Connected accounts update by themselves every morning.
          </p>
        )}
        <AddManualAccount demo={demo} />
      </div>
    </div>
  );
}
