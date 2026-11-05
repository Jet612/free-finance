"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, CircleAlert, LoaderCircle, Pencil, TriangleAlert } from "lucide-react";

import { removeBudget, saveBudget } from "@/app/actions";
import { BudgetMeter } from "@/components/budget-meter";
import { Money } from "@/components/money";
import { EmptyNote, PageHeader, Panel, SectionHeading } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { categoryLabel } from "@/lib/categories";
import { CategoryIcon } from "@/components/category-icon";
import type { BudgetRow, BudgetsData } from "@/lib/detail-data";
import { formatLongMonth, formatWholeCurrency, plural } from "@/lib/format";
import { budgetState, daysInMonth, type BudgetState } from "@/lib/insights";

const SUGGESTION_ROUNDING = 10;

function suggestedLimit(row: BudgetRow): number {
  return Math.max(
    Math.ceil((row.usual ?? row.spent) / SUGGESTION_ROUNDING) * SUGGESTION_ROUNDING,
    SUGGESTION_ROUNDING,
  );
}

function StatusLabel({ state, row }: { state: BudgetState; row: BudgetRow }) {
  if (state === "over") {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-negative">
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        <Money value={Math.abs(row.remaining ?? 0)} whole /> over
      </span>
    );
  }
  if (state === "ahead") {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-warning">
        <CircleAlert className="size-3.5" aria-hidden="true" />
        <Money value={row.remaining ?? 0} whole /> left, running ahead
      </span>
    );
  }
  return (
    <span className="text-muted-foreground">
      <Money value={row.remaining ?? 0} whole /> left
    </span>
  );
}

function LimitEditor({
  row,
  onSave,
  onRemove,
}: {
  row: BudgetRow;
  onSave: (limit: number) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(row.monthlyLimit ?? ""));
  const [invalid, setInvalid] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const label = categoryLabel(row.category);

  // Keyboard users land back where they started, not at the top of the page.
  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [editing]);

  function commit() {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setEditing(false);
    if (next !== row.monthlyLimit) onSave(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      // Otherwise this same keypress lands on the button that gets focus next,
      // and reopens the editor that just closed.
      event.preventDefault();
      returnFocus.current = true;
      commit();
    }
    if (event.key === "Escape") {
      returnFocus.current = true;
      setValue(String(row.monthlyLimit ?? ""));
      setInvalid(false);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <button
        ref={trigger}
        type="button"
        onClick={() => {
          setValue(String(row.monthlyLimit ?? ""));
          setEditing(true);
        }}
        aria-label={`of ${formatWholeCurrency(row.monthlyLimit ?? 0)}, change the ${label} budget`}
        className="group -my-2 inline-flex min-h-11 items-center gap-1 rounded text-[0.8125rem] text-muted-foreground hover:text-foreground sm:my-0 sm:min-h-0"
      >
        of <Money value={row.monthlyLimit ?? 0} whole className="underline decoration-dotted underline-offset-3" />
        <Pencil className="size-3 opacity-60 group-hover:opacity-100" aria-hidden="true" />
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {invalid && (
        <span role="alert" className="text-[0.8125rem] text-destructive">
          Enter an amount above $0.
        </span>
      )}
      <label className="relative">
        <span className="sr-only">Monthly budget for {label}</span>
        <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          autoFocus
          type="number"
          inputMode="decimal"
          min="1"
          step="1"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={onKeyDown}
          onBlur={commit}
          aria-invalid={invalid}
          className="h-8 w-24 pl-5 text-right tnum"
        />
      </label>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        // Runs before the input's blur, so it isn't saved a moment earlier.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setEditing(false);
          onRemove();
        }}
      >
        Remove
      </Button>
    </span>
  );
}

export function BudgetsView({
  data,
  demo = false,
  basePath = "",
}: {
  data: BudgetsData;
  demo?: boolean;
  basePath?: string;
}) {
  const [limits, setLimits] = useState<Record<string, number | null>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ row: BudgetRow; limit: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const dayOfMonth = Number(data.today.slice(8, 10));
  const totalDays = daysInMonth(data.today.slice(0, 7));
  const daysLeft = totalDays - dayOfMonth;
  const monthProgress = (dayOfMonth / totalDays) * 100;

  // Applied straight away, so the page reacts before the server answers.
  const rows = useMemo(
    () =>
      data.budgets.map((row) => {
        if (!(row.category in limits)) return row;
        const monthlyLimit = limits[row.category];
        return {
          ...row,
          monthlyLimit,
          remaining: monthlyLimit === null ? null : monthlyLimit - row.spent,
          percent: monthlyLimit === null ? null : (row.spent / monthlyLimit) * 100,
        };
      }),
    [data.budgets, limits],
  );
  const budgeted = rows
    .filter((row) => row.monthlyLimit !== null)
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0));
  const open = rows
    .filter((row) => row.monthlyLimit === null)
    .sort((a, b) => (b.usual ?? b.spent) - (a.usual ?? a.spent));
  const planned = budgeted.reduce((sum, row) => sum + (row.monthlyLimit ?? 0), 0);
  const spent = budgeted.reduce((sum, row) => sum + row.spent, 0);
  const remaining = planned - spent;
  const overall = planned ? (spent / planned) * 100 : 0;

  function update(row: BudgetRow, limit: number | null) {
    const label = categoryLabel(row.category);
    setLimits((current) => ({ ...current, [row.category]: limit }));
    setMessage(limit === null ? `${label} budget removed.` : `${label} budget saved.`);
    setUndo(limit === null && row.monthlyLimit !== null ? { row, limit: row.monthlyLimit } : null);
    if (demo) return;
    startTransition(async () => {
      const form = new FormData();
      form.set("category", row.category);
      if (limit !== null) form.set("monthlyLimit", String(limit));
      // A dropped connection throws rather than returning, and must not take the page.
      const result = await (limit === null
        ? removeBudget({ status: "idle" }, form)
        : saveBudget({ status: "idle" }, form)
      ).catch(() => null);
      if (result?.status !== "saved") {
        setLimits((current) => {
          const next = { ...current };
          delete next[row.category];
          return next;
        });
        setUndo(null);
        setMessage(result?.message ?? `That didn't save. Check your connection and try again.`);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageHeader
        note
        title={
          budgeted.length ? (
            remaining >= 0 ? (
              <>
                <Money value={remaining} whole /> left of <Money value={planned} whole />
              </>
            ) : (
              <>
                <Money value={Math.abs(remaining)} whole /> over your <Money value={planned} whole /> budget
              </>
            )
          ) : (
            "Set your first budget"
          )
        }
        detail={
          budgeted.length
            ? `${plural(daysLeft, "day")} left in ${formatLongMonth(data.today)}. The tick on each bar marks today, so anything past it is ahead of the month.`
            : open.length
              ? "Pick a category below and start from what you usually spend."
              : undefined
        }
      />

      <div aria-live="polite" className={message ? "-mt-5 flex items-center gap-1.5 text-sm text-muted-foreground" : "sr-only"}>
        {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : message && <Check className="size-3.5" aria-hidden="true" />}
        {message}
        {undo && (
          <Button type="button" variant="ghost" size="sm" onClick={() => update(undo.row, undo.limit)}>
            Undo
          </Button>
        )}
      </div>

      {budgeted.length > 0 && (
        <section aria-labelledby="budgets-heading">
          <h2 id="budgets-heading" className="sr-only">Your budgets</h2>
          <Panel className="divide-y">
            <div className="px-4 py-4">
              <div className="mb-2 flex items-baseline justify-between gap-3 text-[0.9375rem]">
                <span className="font-medium">All budgets</span>
                <span className="text-[0.8125rem] text-muted-foreground">
                  <Money value={spent} whole /> spent, {Math.round(overall)}%
                </span>
              </div>
              <BudgetMeter
                percent={overall}
                monthProgress={monthProgress}
                state={budgetState(overall, monthProgress)}
                label="All budgets used"
              />
            </div>
            {budgeted.map((row) => {
              const label = categoryLabel(row.category);
              const state = budgetState(row.percent, monthProgress);
              return (
                <div key={row.category} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="hidden size-[34px] shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground sm:flex">
                    <CategoryIcon category={row.category} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <Link
                        href={`${basePath}/transactions?category=${row.category}&month=${data.today.slice(0, 7)}`}
                        className="text-[0.9375rem] font-medium underline-offset-3 hover:underline"
                      >
                        {label}
                      </Link>
                      <p className="text-[0.8125rem]">
                        <StatusLabel state={state} row={row} />
                      </p>
                    </div>
                    <BudgetMeter
                      percent={row.percent ?? 0}
                      pendingPercent={row.monthlyLimit ? (row.pending / row.monthlyLimit) * 100 : 0}
                      monthProgress={monthProgress}
                      state={state}
                      label={`${label} budget used`}
                    />
                    <div className="mt-1.5 flex items-center justify-between gap-3 text-[0.8125rem] text-muted-foreground">
                      <span>
                        <Money value={row.spent} whole /> spent
                        {row.pending > 0 && <>, <Money value={row.pending} whole /> pending</>}
                        {row.usual !== null && <>, usually <Money value={row.usual} whole /></>}
                      </span>
                      <LimitEditor
                        row={row}
                        onSave={(limit) => update(row, limit)}
                        onRemove={() => update(row, null)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </Panel>
        </section>
      )}

      <section aria-labelledby="open-heading">
        <SectionHeading
          title={<span id="open-heading">{budgeted.length ? "Not budgeted yet" : "Your spending"}</span>}
          detail={open.length ? "Suggestions come from your last 3 months, rounded up" : undefined}
        />
        {open.length ? (
          <Panel className="divide-y">
            {open.map((row) => {
              const suggestion = suggestedLimit(row);
              return (
                <div key={row.category} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                    <CategoryIcon category={row.category} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium leading-snug">{categoryLabel(row.category)}</span>
                    <span className="block text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
                      <Money value={row.spent} whole /> this month
                      {row.usual !== null && <>, usually <Money value={row.usual} whole /></>}
                    </span>
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => update(row, suggestion)}>
                    Set <Money value={suggestion} whole />
                  </Button>
                </div>
              );
            })}
          </Panel>
        ) : (
          <Panel>
            <EmptyNote
              title={budgeted.length ? "Everything you spend on has a budget" : "Budgets start from your spending"}
              detail={budgeted.length ? undefined : "Connect an account and your categories will appear here."}
              action={
                budgeted.length ? undefined : (
                  <Button asChild>
                    <Link href={`${basePath}/setup`}>Connect an account</Link>
                  </Button>
                )
              }
            />
          </Panel>
        )}
        {(budgeted.length > 0 || open.length > 0) && (
          <p className="mt-3 text-[0.8125rem] leading-5 text-muted-foreground">
            Transfers and credit card payments aren&apos;t counted, so nothing is counted twice.
          </p>
        )}
      </section>
    </div>
  );
}
