"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TransactionRow } from "@/lib/detail-data";
import {
  formatCurrency,
  formatTransactionDateTime,
  titleCase,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function TransactionsTable({
  transactions,
  categories,
  accounts,
}: {
  transactions: TransactionRow[];
  categories: string[];
  accounts: string[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [account, setAccount] = useState("all");
  const [status, setStatus] = useState("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return transactions.filter((transaction) => {
      const matchesSearch =
        !query ||
        [
          transaction.merchantName,
          transaction.name,
          transaction.accountName,
          transaction.category,
        ].some((value) => value?.toLocaleLowerCase().includes(query));
      const matchesCategory =
        category === "all" || transaction.category === category;
      const matchesAccount =
        account === "all" || transaction.accountName === account;
      const matchesStatus =
        status === "all" ||
        (status === "pending" ? transaction.pending : !transaction.pending);
      return (
        matchesSearch &&
        matchesCategory &&
        matchesAccount &&
        matchesStatus
      );
    });
  }, [account, category, search, status, transactions]);

  return (
    <div>
      <div className="grid gap-3 border-b p-4 lg:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(140px,0.35fr))]">
        <label className="relative">
          <span className="sr-only">Search transactions</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search merchant, account, or category"
            className="pl-9"
          />
        </label>
        <FilterSelect
          label="Category"
          value={category}
          onChange={setCategory}
          options={categories.map((value) => ({
            value,
            label: titleCase(value),
          }))}
        />
        <FilterSelect
          label="Account"
          value={account}
          onChange={setAccount}
          options={accounts.map((value) => ({ value, label: value }))}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "posted", label: "Posted" },
            { value: "pending", label: "Pending" },
          ]}
        />
      </div>

      <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground">
        <span>
          {filtered.length.toLocaleString()} transaction
          {filtered.length === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1">
          <SlidersHorizontal className="size-3" />
          Newest first
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="pl-4">Date & time</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="hidden md:table-cell">Account</TableHead>
            <TableHead className="hidden lg:table-cell">Category</TableHead>
            <TableHead className="pr-4 text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((transaction) => {
            const incoming = transaction.amount > 0;
            const occurred = formatTransactionDateTime(
              transaction.transactionAt,
              transaction.date,
            );
            const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
            return (
              <TableRow key={transaction.id}>
                <TableCell className="pl-4 align-top">
                  <p className="text-xs font-medium">{occurred.date}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {occurred.time ?? "Time unavailable"}
                  </p>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full",
                        incoming
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="max-w-[260px] truncate text-sm font-medium">
                        {transaction.merchantName ?? transaction.name}
                      </p>
                      <p className="mt-0.5 max-w-[260px] truncate text-xs text-muted-foreground">
                        {transaction.merchantName
                          ? transaction.name
                          : transaction.paymentChannel
                            ? titleCase(transaction.paymentChannel)
                            : "Transaction"}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <p className="text-sm">{transaction.accountName}</p>
                  {transaction.accountMask && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      •••• {transaction.accountMask}
                    </p>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <Badge variant="outline" className="font-normal">
                    {titleCase(transaction.category)}
                  </Badge>
                </TableCell>
                <TableCell
                  className={cn(
                    "pr-4 text-right font-mono text-sm font-medium tabular-nums",
                    incoming &&
                      "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {incoming ? "+" : ""}
                  {formatCurrency(transaction.amount)}
                  {transaction.pending && (
                    <span className="mt-1 block font-sans text-[10px] font-normal uppercase tracking-wide text-amber-600">
                      Pending
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {!filtered.length && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="h-40 text-center text-sm text-muted-foreground"
              >
                No transactions match those filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="all">All {label.toLocaleLowerCase()}s</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
