import { Landmark, LineChart, MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AccountRow } from "@/lib/data";
import {
  formatCurrency,
  formatDateTime,
  titleCase,
} from "@/lib/format";

export function AccountTable({ accounts }: { accounts: AccountRow[] }) {
  if (!accounts.length) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed bg-muted/20 px-8 text-center">
        <div>
          <Landmark className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No accounts synced</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            Complete Plaid Link, then run the sync workflow to populate this
            table.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Account</TableHead>
            <TableHead className="hidden md:table-cell">Type</TableHead>
            <TableHead className="hidden lg:table-cell">Last sync</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Status</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    {account.source === "robinhood" ? (
                      <LineChart className="size-4" />
                    ) : (
                      <Landmark className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {account.name}
                      {account.mask && (
                        <span className="ml-1.5 font-normal text-muted-foreground">
                          ··{account.mask}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {account.institutionName}
                    </span>
                  </span>
                </div>
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                {titleCase(account.type)}
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                {formatDateTime(account.lastSyncedAt)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-medium tabular-nums">
                {formatCurrency(account.balance)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={account.connected ? "secondary" : "destructive"}
                  className="hidden xl:inline-flex"
                >
                  {account.connected ? "Connected" : "Attention"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled
                  className="xl:hidden"
                  aria-label={
                    account.connected ? "Account connected" : "Account needs attention"
                  }
                >
                  <MoreHorizontal />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
