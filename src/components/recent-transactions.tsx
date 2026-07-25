import { ArrowDownLeft, ArrowUpRight, ReceiptText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { RecentTransaction } from "@/lib/data";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export function RecentTransactions({
  transactions,
}: {
  transactions: RecentTransaction[];
}) {
  if (!transactions.length) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed bg-muted/20 px-8 text-center">
        <div>
          <ReceiptText className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No transactions yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your latest Plaid activity will appear after the first sync.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {transactions.map((transaction) => {
        const incoming = transaction.amount > 0;
        const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
        return (
          <div
            key={transaction.id}
            className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                incoming
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {transaction.merchantName ?? transaction.name}
              </p>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatDate(transaction.date)}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{transaction.accountName}</span>
              </div>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "font-mono text-sm font-medium tabular-nums",
                  incoming && "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {incoming ? "+" : ""}
                {formatCurrency(transaction.amount)}
              </p>
              {transaction.category && (
                <Badge
                  variant="outline"
                  className="mt-1 hidden font-normal sm:inline-flex"
                >
                  {titleCase(transaction.category)}
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
