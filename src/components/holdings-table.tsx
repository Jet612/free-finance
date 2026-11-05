"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Money } from "@/components/money";
import type { HoldingSummary } from "@/lib/detail-data";
import { formatPercent, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey = "symbol" | "value" | "gain" | "share";

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "symbol", label: "Holding" },
  { key: "share", label: "Share", align: "right" },
  { key: "gain", label: "Gain or loss", align: "right" },
  { key: "value", label: "Value", align: "right" },
];

function sortValue(holding: HoldingSummary, key: SortKey): number | string {
  if (key === "symbol") return holding.symbol;
  return holding[key] ?? Number.NEGATIVE_INFINITY;
}

function GainCell({ holding }: { holding: HoldingSummary }) {
  if (holding.assetType === "cash") {
    return <span className="text-[0.8125rem] text-muted-foreground">Cash</span>;
  }
  if (holding.gain === null) {
    return <span className="text-[0.8125rem] text-muted-foreground">Not shared</span>;
  }
  return (
    <span className={cn("block", holding.gain >= 0 ? "text-positive" : "text-negative")}>
      <Money value={holding.gain} signed whole className="tnum block text-[0.9375rem] font-medium" />
      <span className="tnum block text-[0.8125rem]">{formatPercent(holding.gainPercent, 1)}</span>
    </span>
  );
}

export function HoldingsTable({ holdings }: { holdings: HoldingSummary[] }) {
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: "value",
    descending: true,
  });
  const rows = useMemo(() => {
    const direction = sort.descending ? -1 : 1;
    return [...holdings].sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      if (typeof left === "string" || typeof right === "string") {
        return String(left).localeCompare(String(right)) * direction;
      }
      return (left - right) * direction;
    });
  }, [holdings, sort]);

  return (
    <table className="w-full text-left">
      <caption className="sr-only">Everything you own, combined across accounts</caption>
      <thead>
        <tr className="border-b">
          {COLUMNS.map((column) => {
            const active = sort.key === column.key;
            const Arrow = sort.descending ? ArrowDown : ArrowUp;
            return (
              <th
                key={column.key}
                scope="col"
                aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}
                className={cn(
                  "px-4 py-2 text-[0.8125rem] font-medium text-muted-foreground",
                  column.align === "right" && "text-right",
                  column.key === "share" && "hidden sm:table-cell",
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setSort((current) => ({
                      key: column.key,
                      descending: current.key === column.key ? !current.descending : column.key !== "symbol",
                    }))
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded hover:text-foreground",
                    active && "text-foreground",
                  )}
                >
                  {column.label}
                  {active && <Arrow className="size-3" aria-hidden="true" />}
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((holding) => (
          <tr key={holding.symbol}>
            <th scope="row" className="min-w-0 px-4 py-2.5 font-normal">
              <span className="block text-[0.9375rem] font-medium leading-snug">{holding.symbol}</span>
              <span className="block max-w-[38vw] truncate text-[0.8125rem] leading-[1.125rem] text-muted-foreground sm:max-w-sm">
                {holding.name}
              </span>
            </th>
            <td className="tnum hidden px-4 py-2.5 text-right text-[0.9375rem] sm:table-cell">
              {formatPercent(holding.share, 1)}
            </td>
            <td className="px-4 py-2.5 text-right">
              <GainCell holding={holding} />
            </td>
            <td className="px-4 py-2.5 text-right">
              <Money value={holding.value} whole className="tnum block text-[0.9375rem] font-medium" />
              {holding.assetType !== "cash" && (
                <span className="tnum block text-[0.8125rem] text-muted-foreground">
                  {formatQuantity(holding.quantity)} {holding.quantity === 1 ? "share" : "shares"}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
