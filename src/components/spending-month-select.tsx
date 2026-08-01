"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMonth } from "@/lib/format";

export function SpendingMonthSelect({
  months,
  selectedMonth,
}: {
  months: string[];
  selectedMonth: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const selectedValue = selectedMonth.slice(0, 7);
  const selectedIndex = months.findIndex(
    (month) => month.slice(0, 7) === selectedValue,
  );
  const olderMonth =
    selectedIndex >= 0 ? months[selectedIndex + 1] : undefined;
  const newerMonth = selectedIndex > 0 ? months[selectedIndex - 1] : undefined;
  const monthGroups = Array.from(
    months.reduce((groups, month) => {
      const year = month.slice(0, 4);
      const group = groups.get(year) ?? [];
      group.push(month);
      groups.set(year, group);
      return groups;
    }, new Map<string, string[]>()),
  );

  function navigateToMonth(month: string | undefined) {
    if (!month || isPending) return;
    startTransition(() => {
      router.push(
        `/reports?month=${encodeURIComponent(month.slice(0, 7))}`,
        { scroll: false },
      );
    });
  }

  return (
    <div className="grid gap-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        View month
      </p>
      <div className="flex items-center rounded-xl border bg-card/80 p-1 shadow-sm">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!olderMonth || isPending}
          onClick={() => navigateToMonth(olderMonth)}
          aria-label={
            olderMonth
              ? `Previous month: ${formatMonth(olderMonth)}`
              : "No earlier month available"
          }
          title={olderMonth ? formatMonth(olderMonth) : undefined}
        >
          <ChevronLeft />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Select
          value={selectedValue}
          disabled={isPending}
          onValueChange={navigateToMonth}
        >
          <SelectTrigger
            aria-label="Jump to spending month"
            className="h-8 min-w-40 border-0 bg-transparent px-3 font-medium shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-muted/50"
          >
            <CalendarDays className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="center"
            className="max-h-72"
          >
            {monthGroups.map(([year, yearMonths]) => (
              <SelectGroup key={year}>
                <SelectLabel>{year}</SelectLabel>
                {yearMonths.map((month) => (
                  <SelectItem key={month} value={month.slice(0, 7)}>
                    {formatMonth(month)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!newerMonth || isPending}
          onClick={() => navigateToMonth(newerMonth)}
          aria-label={
            newerMonth
              ? `Next month: ${formatMonth(newerMonth)}`
              : "No later month available"
          }
          title={newerMonth ? formatMonth(newerMonth) : undefined}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
