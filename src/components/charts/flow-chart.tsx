import Link from "next/link";

import { Money } from "@/components/money";
import { formatCompactCurrency, formatCurrency, formatLongMonth, formatMonthYear } from "@/lib/format";
import type { MonthlyFlow } from "@/lib/insights";
import { cn } from "@/lib/utils";

const HEIGHT = 184;
/** Six months is what fits with a usable tap target on a phone. */
const PHONE_MONTHS = 6;
/** Room above the tallest mark, so income never sits on a gridline. */
const HEADROOM = 1.14;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  const step = scaled <= 2 ? 0.5 : scaled <= 5 ? 1 : 2;
  return Math.ceil(scaled / step) * step * power;
}

function shortMonth(month: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(
    new Date(`${month.slice(0, 7)}-15T12:00:00Z`),
  );
}

/**
 * Each month's spending as a bar, under a line for that month's income. The band
 * between them is what was kept, or what went over, so the thing worth seeing is
 * the shape itself. Each month links to its own detail.
 */
export function FlowChart({
  months,
  selected,
  currentMonth,
  usual,
  hrefFor,
}: {
  months: MonthlyFlow[];
  selected: string;
  currentMonth: string;
  usual: number | null;
  hrefFor: (month: string) => string;
}) {
  const firstWithData = months.findIndex((item) => item.income > 0 || item.spending > 0);
  const shown = firstWithData < 0 ? [] : months.slice(firstWithData);
  if (!shown.length) return null;
  const top = niceMax(
    Math.max(...shown.flatMap((item) => [item.income, item.spending])) * HEADROOM,
  );
  const grid = [top, top / 2, 0];
  const hiddenOnPhones = Math.max(shown.length - PHONE_MONTHS, 0);
  const columns = {
    "--columns": shown.length,
    "--phone-columns": Math.min(shown.length, PHONE_MONTHS),
  } as React.CSSProperties;
  const columnClass =
    "grid gap-0.5 grid-cols-[repeat(var(--phone-columns),minmax(0,1fr))] sm:grid-cols-[repeat(var(--columns),minmax(0,1fr))]";
  const inProgress = shown.some((item) => item.month.slice(0, 7) === currentMonth);
  const percent = (value: number) => `${(value / top) * 100}%`;
  const hasUsual = usual !== null && usual > 0;

  return (
    <figure className="m-0">
      <div className="relative pr-11" style={{ height: HEIGHT }}>
        {grid.map((value) => (
          <div
            key={value}
            aria-hidden="true"
            className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-2"
            style={{ top: `${(1 - value / top) * 100}%` }}
          >
            <span className="h-px flex-1 bg-border" />
            <span className="money tnum w-9 text-right text-xs text-muted-foreground">
              {formatCompactCurrency(value)}
            </span>
          </div>
        ))}
        <div className={cn("relative h-full", columnClass)} style={columns}>
          {shown.map((item, index) => {
            const key = item.month.slice(0, 7);
            const active = key === selected.slice(0, 7);
            const current = key === currentMonth;
            const nearRightEdge = index >= shown.length - 3;
            const low = Math.min(item.income, item.spending);
            const high = Math.max(item.income, item.spending);
            return (
              <Link
                key={item.month}
                href={hrefFor(item.month)}
                scroll={false}
                aria-current={active ? "date" : undefined}
                aria-label={`${formatMonthYear(item.month)}${current ? ", so far" : ""}: spent ${formatCurrency(item.spending)}, income ${formatCurrency(item.income)}`}
                className={cn(
                  "group relative items-end justify-center rounded-sm outline-offset-1 hover:bg-accent/60",
                  index < hiddenOnPhones ? "hidden sm:flex" : "flex",
                  active && "bg-accent",
                )}
              >
                {/* What was kept, or what went over. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute w-[min(58%,1.5rem)] rounded-t-[4px]",
                    item.income >= item.spending ? "bg-positive/20" : "bg-negative/25",
                  )}
                  style={{ bottom: percent(low), height: percent(high - low) }}
                />
                <span
                  aria-hidden="true"
                  className={cn("w-[min(58%,1.5rem)] rounded-t-[4px] bg-primary", current && "opacity-45")}
                  style={{ height: percent(item.spending) }}
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-x-[14%] h-0.5 rounded-full bg-positive"
                  style={{ bottom: percent(item.income) }}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-lg group-hover:block group-focus-visible:block",
                    nearRightEdge ? "right-0" : "left-0",
                  )}
                >
                  <span className="block text-xs text-muted-foreground">
                    {formatMonthYear(item.month)}
                    {current && ", so far"}
                  </span>
                  <span className="mt-1 flex justify-between gap-4 text-sm font-semibold">
                    <Money value={item.spending} whole className="tnum" />
                    <span className="text-xs font-normal text-muted-foreground">Spent</span>
                  </span>
                  <span className="flex justify-between gap-4 text-sm font-semibold">
                    <Money value={item.income} whole className="tnum" />
                    <span className="text-xs font-normal text-muted-foreground">Income</span>
                  </span>
                  <span className="flex justify-between gap-4 text-sm font-semibold">
                    <Money value={item.net} whole signed className="tnum" />
                    <span className="text-xs font-normal text-muted-foreground">Kept</span>
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
        {hasUsual && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-11 h-[1.5px] bg-cat-2"
            style={{ bottom: percent(usual) }}
          />
        )}
      </div>
      <div
        aria-hidden="true"
        className={cn("mt-1.5 pr-11 text-center text-xs text-muted-foreground", columnClass)}
        style={columns}
      >
        {shown.map((item, index) => (
          <span
            key={item.month}
            className={cn(
              index < hiddenOnPhones && "hidden sm:block",
              item.month.slice(0, 7) === selected.slice(0, 7) && "font-semibold text-foreground",
            )}
          >
            {shortMonth(item.month)}
          </span>
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-primary" />
          Spending
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-3.5 rounded-full bg-positive" />
          Income
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-positive/20" />
          Kept
        </span>
        {shown.some((item) => item.spending > item.income) && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-[3px] bg-negative/25" />
            Went over
          </span>
        )}
        {hasUsual && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[1.5px] w-3.5 bg-cat-2" />
            Usual month
          </span>
        )}
        {inProgress && <span>{formatLongMonth(`${currentMonth}-01`)} is still in progress</span>}
      </figcaption>
    </figure>
  );
}
