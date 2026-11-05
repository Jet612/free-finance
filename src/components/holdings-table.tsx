import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HoldingSummary } from "@/lib/detail-data";
import {
  assetTypeLabel,
  formatCurrency,
  formatPercent,
  formatQuantity,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function HoldingsTable({ holdings }: { holdings: HoldingSummary[] }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Holding</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Shares</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Price</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="hidden text-right md:table-cell">Gain/loss</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Share of total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {holdings.map((holding) => (
            <TableRow key={holding.symbol}>
              <TableCell className="max-w-[16rem]">
                <span className="block truncate text-sm font-medium">
                  {holding.symbol}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {holding.name} · {assetTypeLabel(holding.assetType)}
                </span>
              </TableCell>
              <TableCell className="hidden text-right font-mono text-sm tabular-nums sm:table-cell">
                {formatQuantity(holding.quantity)}
              </TableCell>
              <TableCell className="hidden text-right font-mono text-sm tabular-nums lg:table-cell">
                {holding.price === null ? "—" : formatCurrency(holding.price)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-medium tabular-nums">
                {formatCurrency(holding.value)}
              </TableCell>
              <TableCell
                className={cn(
                  "hidden text-right font-mono text-sm tabular-nums md:table-cell",
                  holding.gain !== null &&
                    holding.assetType !== "cash" &&
                    (holding.gain >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"),
                )}
              >
                {holding.assetType === "cash" ? (
                  <span className="text-muted-foreground">—</span>
                ) : holding.gain === null ? (
                  <span className="text-muted-foreground">Not shared</span>
                ) : (
                  <>
                    {formatCurrency(holding.gain)}
                    <span className="ml-1.5 text-xs">
                      ({formatPercent(holding.gainPercent)})
                    </span>
                  </>
                )}
              </TableCell>
              <TableCell className="hidden text-right font-mono text-sm tabular-nums lg:table-cell">
                {formatPercent(holding.share)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
