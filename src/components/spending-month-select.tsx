"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
    <div className="inline-flex w-fit max-w-full items-center rounded-lg border bg-card/70 p-0.5">
      <p className="sr-only">
        View month
      </p>
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
      <Select
        value={selectedValue}
        disabled={isPending}
        onValueChange={navigateToMonth}
      >
        <SelectTrigger
          size="sm"
          aria-label="Jump to spending month"
          className="w-36 justify-center border-0 bg-transparent px-2 font-medium shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-muted/50"
        >
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
  );
}
