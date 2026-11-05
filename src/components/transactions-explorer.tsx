"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, ExternalLink, ListFilter, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  recategorizeMerchant,
  recategorizeTransaction,
  setTransactionIgnored,
  undoMerchantCategory,
} from "@/app/transaction-actions";

import { MerchantIcon } from "@/components/merchant-icon";
import { Money } from "@/components/money";
import { EmptyNote, Panel } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CATEGORY_CHOICES, categoryLabel, subcategoryLabel } from "@/lib/categories";
import type { TransactionRow, TransactionsData } from "@/lib/detail-data";
import { websiteHostname } from "@/lib/external-url";
import {
  formatDayHeading,
  formatMonthYear,
  formatShortDate,
  plural,
  titleCase,
} from "@/lib/format";
import {
  cashFlowTotals,
  DEFAULT_FILTERS,
  filterTransactions,
  hasActiveFilters,
  PERIODS,
  transactionFiltersQuery,
  transactionsCsv,
  type Period,
  type TransactionFilters,
  type TransactionStatus,
} from "@/lib/transaction-filters";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 120;
const MERCHANT_HISTORY_ROWS = 5;

function merchantOf(item: TransactionRow): string {
  return item.merchantName ?? item.name;
}

function groupByDay(rows: TransactionRow[]) {
  const days: { date: string; rows: TransactionRow[] }[] = [];
  for (const row of rows) {
    const day = days.at(-1);
    if (day?.date === row.date) day.rows.push(row);
    else days.push({ date: row.date, rows: [row] });
  }
  return days;
}

type Correction = {
  category?: string | null;
  categoryDetailed?: string | null;
  ignored?: boolean;
};

function typingInField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

function download(rows: TransactionRow[]) {
  const url = URL.createObjectURL(
    new Blob([transactionsCsv(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "transactions.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function TransactionsExplorer({
  data,
  initialFilters,
  initialOpenId,
  demo = false,
  basePath = "",
}: {
  data: TransactionsData;
  initialFilters: TransactionFilters;
  initialOpenId?: number;
  demo?: boolean;
  basePath?: string;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [corrections, setCorrections] = useState<Record<number, Correction>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [widened, setWidened] = useState(false);
  const [, startSaving] = useTransition();
  const [reloading, startReloading] = useTransition();
  const router = useRouter();
  const reloadedQuery = useRef(transactionFiltersQuery(initialFilters));
  const lastRow = useRef<HTMLElement | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [cursor, setCursor] = useState(-1);
  const [openId, setOpenId] = useState<number | null>(initialOpenId ?? null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Corrections show at once, ahead of the server confirming them.
  const transactions = useMemo(
    () =>
      data.transactions.map((item) => {
        const correction = corrections[item.id];
        return correction ? { ...item, ...correction } : item;
      }),
    [corrections, data.transactions],
  );
  const filtered = useMemo(
    () => filterTransactions(transactions, filters, data.periodStarts),
    [data.periodStarts, transactions, filters],
  );
  const totals = useMemo(() => cashFlowTotals(filtered), [filtered]);
  const visible = filtered.slice(0, limit);
  const days = useMemo(() => groupByDay(visible), [visible]);
  const positions = useMemo(
    () => new Map(visible.map((item, index) => [item.id, index])),
    [visible],
  );
  const opened = transactions.find((item) => item.id === openId) ?? null;

  function correct(ids: number[], change: Correction, save: () => Promise<{ ok: boolean; message?: string }>) {
    const before = corrections;
    setSaveError(null);
    setCorrections((current) => {
      const next = { ...current };
      for (const id of ids) next[id] = { ...next[id], ...change };
      return next;
    });
    if (demo) return;
    startSaving(async () => {
      // A dropped connection throws rather than returning, and must not take the page.
      const result = await save().catch(() => ({ ok: false, message: undefined }));
      if (!result.ok) {
        setCorrections(before);
        setSaveError(result.message ?? "That didn't save. Check your connection and try again.");
      }
    });
  }

  function openRow(id: number, row: HTMLElement | null) {
    lastRow.current = row;
    setOpenId(id);
  }

  /** Searching means "find it", so it looks at all of history, not just this month. */
  function runSearch(q: string) {
    const widen = Boolean(q) && filters.period === DEFAULT_FILTERS.period && !filters.month;
    const restore = !q && widened;
    if (widen) setWidened(true);
    if (restore) setWidened(false);
    update({
      q,
      ...(widen ? { period: "all" as const } : {}),
      ...(restore ? { period: DEFAULT_FILTERS.period } : {}),
    });
  }

  function update(change: Partial<TransactionFilters>) {
    setFilters((current) => ({ ...current, ...change }));
    setLimit(PAGE_SIZE);
    setCursor(-1);
  }

  // Keeps the address bar in step, so a filtered view can be reloaded or shared.
  useEffect(() => {
    const query = transactionFiltersQuery(filters);
    const url = query ? `?${query}` : window.location.pathname;
    if (!data.serverFiltered) {
      window.history.replaceState(null, "", url);
      return;
    }
    // With more history than the page holds, the database has to do the filtering.
    if (query === reloadedQuery.current) return;
    const timer = window.setTimeout(() => {
      reloadedQuery.current = query;
      startReloading(() => router.replace(url, { scroll: false }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [data.serverFiltered, filters, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (typingInField(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      // Nothing behind an open drawer or menu should react to a keypress.
      if (document.querySelector('[role="dialog"]')) return;
      // Enter already means something on a focused control.
      if (
        event.key === "Enter" &&
        event.target instanceof HTMLElement &&
        event.target.closest("button, a, [role='combobox']")
      ) {
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        search.current?.focus();
      } else if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        setCursor((current) =>
          Math.min(Math.max(current + (event.key === "j" ? 1 : -1), 0), visible.length - 1),
        );
      } else if (event.key === "Enter" && cursor >= 0 && visible[cursor]) {
        lastRow.current = list.current?.querySelector<HTMLElement>(`[data-position="${cursor}"]`) ?? null;
        setOpenId(visible[cursor].id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cursor, visible]);

  useEffect(() => {
    if (cursor < 0) return;
    list.current
      ?.querySelector(`[data-position="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const periodValue = filters.month ? `month:${filters.month}` : filters.period;
  const active = hasActiveFilters(filters);
  const filterCount = [
    filters.month || filters.period !== DEFAULT_FILTERS.period,
    filters.category !== "all",
    filters.account !== "all",
    filters.status !== "all",
  ].filter(Boolean).length;

  const filterFields = (
    <>
      <Filter
        label="Period"
        value={periodValue}
        onChange={(value) =>
          value.startsWith("month:")
            ? update({ month: value.slice(6) })
            : update({ period: value as Period, month: null })
        }
        options={[
          ...(filters.month
            ? [{ value: `month:${filters.month}`, label: formatMonthYear(filters.month) }]
            : []),
          ...PERIODS,
        ]}
      />
      <Filter
        label="Category"
        value={filters.category}
        onChange={(category) => update({ category })}
        options={[
          { value: "all", label: "All categories" },
          ...data.categories
            .map((value) => ({ value, label: categoryLabel(value) }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        ]}
      />
      <Filter
        label="Account"
        value={filters.account}
        onChange={(account) => update({ account })}
        options={[
          { value: "all", label: "All accounts" },
          ...data.accounts.map((value) => ({ value, label: value })),
        ]}
      />
      <Filter
        label="Status"
        value={filters.status}
        onChange={(status) => update({ status: status as TransactionStatus })}
        options={[
          { value: "all", label: "Any status" },
          { value: "posted", label: "Posted" },
          { value: "pending", label: "Pending" },
        ]}
      />
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search transactions</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={search}
            value={filters.q}
            onChange={(event) => runSearch(event.target.value)}
            placeholder="Search merchants, accounts, categories"
            className="h-10 bg-card pl-9 pr-9"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-background px-1.5 text-xs text-muted-foreground lg:block">
            /
          </kbd>
        </label>
        <div className="hidden gap-2 lg:flex">{filterFields}</div>
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" className="h-10 shrink-0 bg-card lg:hidden">
              <ListFilter />
              Filters
              {filterCount > 0 && <span className="tnum font-semibold">{filterCount}</span>}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader className="p-5 pb-0">
              <SheetTitle className="semiwide text-lg font-semibold">Filters</SheetTitle>
              <SheetDescription>{plural(filtered.length, "transaction")} match.</SheetDescription>
            </SheetHeader>
            <div className="grid gap-3 p-5">{filterFields}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{plural(filtered.length, "transaction")}</span>
          {filtered.length > 0 && (
            <>
              {", "}
              <Money value={totals.spending} /> spent
              {totals.income > 0 && (
                <>
                  {", "}
                  <Money value={totals.income} /> income
                </>
              )}
            </>
          )}
          {totals.notCounted > 0 && (
            <span className="block text-[0.8125rem]">
              Transfers, card payments, and pending charges aren&apos;t counted
              {filters.month && ", so this matches Spending"}.
            </span>
          )}
        </p>
        <div className="flex items-center gap-1">
          {active && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setWidened(false);
                update(DEFAULT_FILTERS);
              }}
            >
              <X />
              Clear filters
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!filtered.length}
            onClick={() => download(filtered)}
          >
            <Download />
            Download CSV
          </Button>
        </div>
      </div>

      <div ref={list} className={cn("transition-opacity", reloading && "opacity-60")}>
        {days.length > 0 && <Panel>
        {days.map((day, dayIndex) => (
          <section key={day.date} aria-label={formatDayHeading(day.date, data.today)}>
            <div
              className={cn(
                "sticky top-14 z-10 border-y bg-muted px-4 py-1.5 text-[0.8125rem]",
                dayIndex === 0 && "rounded-t-xl border-t-0",
              )}
            >
              <h2 className="font-semibold">{formatDayHeading(day.date, data.today)}</h2>
            </div>
              <ul className="divide-y">
                {day.rows.map((row) => {
                  const position = positions.get(row.id);
                  const incoming = row.amount > 0;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        data-position={position}
                        onClick={(event) => openRow(row.id, event.currentTarget)}
                        aria-haspopup="dialog"
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2.5 text-left outline-offset-[-2px] transition-colors hover:bg-accent/50",
                          position === cursor && "bg-accent",
                        )}
                      >
                        <MerchantIcon
                          src={row.logoUrl}
                          category={row.category}
                          categoryDetailed={row.categoryDetailed}
                          incoming={incoming}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.9375rem] font-medium leading-snug">
                            {merchantOf(row)}
                          </span>
                          <span className="block truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
                            {categoryLabel(row.category)}, {row.accountName}
                            {row.ignored && ", left out of totals"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <Money
                            value={row.amount}
                            signed={incoming}
                            className={cn("tnum block text-[0.9375rem] font-medium", incoming && "text-positive")}
                          />
                          {row.pending && (
                            <span className="block text-[0.8125rem] leading-[1.125rem] text-warning">Pending</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
          </section>
        ))}
        </Panel>}

        {!filtered.length && (
          <Panel>
            <EmptyNote
              title={data.transactions.length ? "No transactions match" : "No transactions yet"}
              detail={
                data.transactions.length
                  ? "Try a longer period or fewer filters."
                  : "Connect an account and they'll appear here."
              }
              action={
                data.transactions.length ? (
                  active ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => update({ ...DEFAULT_FILTERS, period: "all" })}>
                      Show everything
                    </Button>
                  ) : undefined
                ) : (
                  <Button asChild>
                    <Link href={`${basePath}/setup`}>Connect an account</Link>
                  </Button>
                )
              }
            />
          </Panel>
        )}
      </div>

      {filtered.length > visible.length && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, filtered.length - visible.length)} more
          </Button>
        </div>
      )}

      {data.totalCount > data.transactions.length && (
        <p className="text-[0.8125rem] leading-5 text-muted-foreground">
          Showing your {data.transactions.length.toLocaleString("en-US")} most recent of{" "}
          {data.totalCount.toLocaleString("en-US")} transactions. Search and filters cover the ones shown here.
        </p>
      )}

      <p className="hidden text-[0.8125rem] text-muted-foreground lg:block">
        Press <Key>/</Key> to search, <Key>j</Key> and <Key>k</Key> to move through the list, and <Key>Enter</Key> to open one.
      </p>

      <Sheet open={opened !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent
          className="w-[calc(100%-1rem)] overflow-y-auto p-0 sm:max-w-md"
          onOpenAutoFocus={(event) => {
            // The drawer itself takes focus. Landing on the category control would
            // let the Enter that opened this also open that, one key from a change.
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
          onCloseAutoFocus={(event) => {
            // Back to the row it came from, not the top of the page.
            if (lastRow.current?.isConnected) {
              event.preventDefault();
              lastRow.current.focus();
            }
          }}
        >
          {opened && (
            <TransactionDetails
              key={opened.id}
              transaction={opened}
              all={transactions}
              today={data.today}
              saveError={saveError}
              onCategory={(category) =>
                correct([opened.id], { category, categoryDetailed: null }, () =>
                  recategorizeTransaction(opened.id, category),
                )
              }
              onMerchantCategory={(ids, category) =>
                correct(ids, { category, categoryDetailed: null }, () =>
                  recategorizeMerchant(opened.id, category),
                )
              }
              onUndoMerchant={(previous) => {
                setCorrections((current) => {
                  const next = { ...current };
                  for (const item of previous) {
                    next[item.id] = {
                      ...next[item.id],
                      category: item.category,
                      categoryDetailed: item.detailed,
                    };
                  }
                  return next;
                });
                if (!demo) {
                  startSaving(async () => {
                    const result = await undoMerchantCategory(opened.id, previous).catch(() => null);
                    if (!result?.ok) setSaveError("That didn't undo. Check your connection and try again.");
                  });
                }
              }}
              onIgnored={(ignored) =>
                correct([opened.id], { ignored }, () => setTransactionIgnored(opened.id, ignored))
              }
              onSeeAll={(merchant) => {
                setOpenId(null);
                update({ ...DEFAULT_FILTERS, q: merchant, period: "all" });
              }}
              onOpen={setOpenId}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border bg-card px-1.5 py-px text-xs font-medium text-foreground">
      {children}
    </kbd>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-10 w-full bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TransactionDetails({
  transaction,
  all,
  today,
  saveError,
  onCategory,
  onMerchantCategory,
  onUndoMerchant,
  onIgnored,
  onSeeAll,
  onOpen,
}: {
  transaction: TransactionRow;
  all: TransactionRow[];
  today: string;
  saveError: string | null;
  onCategory: (category: string) => void;
  onMerchantCategory: (ids: number[], category: string) => void;
  onUndoMerchant: (previous: { id: number; category: string | null; detailed: string | null }[]) => void;
  onIgnored: (ignored: boolean) => void;
  onSeeAll: (merchant: string) => void;
  onOpen: (id: number) => void;
}) {
  // Set after a category change, to offer the same change for the whole merchant.
  const [offer, setOffer] = useState<{
    category: string;
    /** Every charge as it stood before, so the whole change can be undone. */
    previous: { id: number; category: string | null; detailed: string | null }[];
  } | null>(null);
  const [applied, setApplied] = useState<NonNullable<typeof offer>["previous"] | null>(null);
  const incoming = transaction.amount > 0;
  const merchant = merchantOf(transaction);
  const history = all.filter((item) => merchantOf(item) === merchant);
  const spent = history.filter((item) => item.amount < 0);
  const total = spent.reduce((sum, item) => sum - item.amount, 0);
  const others = history.filter((item) => item.id !== transaction.id);

  return (
    <>
      <SheetHeader className="gap-3 border-b p-5 pr-12">
        <div className="flex items-center gap-3">
          <MerchantIcon
            large
            src={transaction.logoUrl}
            category={transaction.category}
            categoryDetailed={transaction.categoryDetailed}
            incoming={incoming}
          />
          <div className="min-w-0">
            <SheetTitle className="semiwide truncate text-lg font-semibold">{merchant}</SheetTitle>
            <SheetDescription>{formatDayHeading(transaction.date, today)}</SheetDescription>
          </div>
        </div>
        <p className={cn("wide text-[2rem] font-semibold leading-none tracking-[-0.02em]", incoming && "text-positive")}>
          <Money value={transaction.amount} signed={incoming} />
        </p>
        {transaction.pending && (
          <p className="text-sm text-warning">Pending. The amount can change until it posts.</p>
        )}
      </SheetHeader>

      <div className="grid gap-6 p-5">
        <dl className="grid gap-2.5 text-sm">
          <Detail label="Category">
            {transaction.pending ? (
              <>
                {categoryLabel(transaction.category)}
                <span className="block text-[0.8125rem] text-muted-foreground">
                  You can change this once it posts.
                </span>
              </>
            ) : (
              <>
                <Select
                  value={transaction.category ?? "OTHER"}
                  onValueChange={(category) => {
                    const previous = history
                      .filter((item) => !item.pending)
                      .map((item) => ({
                        id: item.id,
                        category: item.category,
                        detailed: item.categoryDetailed,
                      }));
                    onCategory(category);
                    setApplied(null);
                    if (others.length) setOffer({ category, previous });
                  }}
                >
                  <SelectTrigger aria-label="Category" className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    {CATEGORY_CHOICES.map((choice) => (
                      <SelectItem key={choice.value} value={choice.value}>
                        {choice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {transaction.categoryDetailed && (
                  <span className="mt-1 block text-[0.8125rem] text-muted-foreground">
                    {subcategoryLabel(transaction.categoryDetailed, transaction.category)}
                  </span>
                )}
              </>
            )}
          </Detail>
          <Detail label="Account">
            {transaction.accountName}
            <span className="block text-[0.8125rem] text-muted-foreground">
              {transaction.institutionName}
              {transaction.accountMask && ` ending ${transaction.accountMask}`}
            </span>
          </Detail>
          {transaction.location && <Detail label="Where">{transaction.location}</Detail>}
          {transaction.website && (
            <Detail label="Website">
              <a
                href={transaction.website}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                className="inline-flex items-center gap-1 underline underline-offset-3"
              >
                {websiteHostname(transaction.website)}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </Detail>
          )}
        </dl>

        {offer && (
          <div role="status" className="rounded-lg bg-accent p-3 text-sm">
            <p>
              Use {categoryLabel(offer.category)} for all {history.length} {merchant} charges, and any new ones?
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onMerchantCategory(offer.previous.map((item) => item.id), offer.category);
                  setApplied(offer.previous);
                  setOffer(null);
                }}
              >
                Yes, all of them
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setOffer(null)}>
                Just this one
              </Button>
            </div>
          </div>
        )}

        {applied && (
          <div role="status" className="flex items-center justify-between gap-3 rounded-lg bg-accent px-3 py-1.5 text-sm">
            <span>Updated {plural(applied.length, "charge")}. New ones will follow.</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onUndoMerchant(applied);
                setApplied(null);
              }}
            >
              Undo
            </Button>
          </div>
        )}

        {!transaction.pending && (
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={transaction.ignored}
              onChange={(event) => onIgnored(event.target.checked)}
              className="mt-0.5 size-4 accent-[var(--primary)]"
            />
            <span>
              Leave this out of my totals
              <span className="block text-[0.8125rem] leading-5 text-muted-foreground">
                For things like a reimbursed work expense. It stays in this list.
              </span>
            </span>
          </label>
        )}

        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}

        {history.length > 1 && (
          <section aria-labelledby="merchant-history">
            <h3 id="merchant-history" className="semiwide text-[0.9375rem] font-semibold">
              You and {merchant}
            </h3>
            {spent.length > 0 && (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                <Money value={total} /> across {plural(spent.length, "charge")}, about{" "}
                <Money value={total / spent.length} /> each.
              </p>
            )}
            <ul className="mt-2 divide-y rounded-lg ring-1 ring-border">
              {others.slice(0, MERCHANT_HISTORY_ROWS).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(item.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm outline-offset-[-2px] hover:bg-accent/50"
                  >
                    <span>{formatShortDate(item.date, item.date.slice(0, 4) !== today.slice(0, 4))}</span>
                    <Money value={item.amount} className="tnum" />
                  </button>
                </li>
              ))}
            </ul>
            {others.length > MERCHANT_HISTORY_ROWS && (
              <Button type="button" variant="ghost" size="sm" className="mt-1.5 -ml-2" onClick={() => onSeeAll(merchant)}>
                See all {history.length}
              </Button>
            )}
          </section>
        )}

        <details className="group text-sm">
          <summary className="cursor-pointer rounded text-[0.8125rem] font-medium text-muted-foreground hover:text-foreground">
            What the bank sent
          </summary>
          <dl className="mt-2.5 grid gap-2.5">
            <Detail label="Description">{transaction.name}</Detail>
            {transaction.originalDescription && transaction.originalDescription !== transaction.name && (
              <Detail label="Original">{transaction.originalDescription}</Detail>
            )}
            {transaction.authorizedDate && (
              <Detail label="Authorized">{formatShortDate(transaction.authorizedDate, true)}</Detail>
            )}
            <Detail label="Posted">{formatShortDate(transaction.date, true)}</Detail>
            {transaction.paymentChannel && (
              <Detail label="Paid">{titleCase(transaction.paymentChannel)}</Detail>
            )}
            {transaction.checkNumber && <Detail label="Check">{transaction.checkNumber}</Detail>}
            {transaction.transactionCode && (
              <Detail label="Type">{titleCase(transaction.transactionCode)}</Detail>
            )}
            {transaction.storeNumber && <Detail label="Store">{transaction.storeNumber}</Detail>}
            <Detail label="Reference">
              <span className="break-all text-[0.8125rem]">{transaction.externalId}</span>
            </Detail>
          </dl>
        </details>
      </div>
    </>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
