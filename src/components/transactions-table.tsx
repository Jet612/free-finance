"use client";

import Image from "next/image";
import { type ReactNode, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Globe2,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TransactionRow } from "@/lib/detail-data";
import { websiteHostname } from "@/lib/external-url";
import {
  formatCurrency,
  formatDateTime,
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
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionRow | null>(null);

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
            return (
              <TableRow
                key={transaction.id}
                data-state={
                  selectedTransaction?.id === transaction.id
                    ? "selected"
                    : undefined
                }
                onClick={() => setSelectedTransaction(transaction)}
                className="cursor-pointer"
              >
                <TableCell className="pl-4 align-top">
                  <p className="text-xs font-medium">{occurred.date}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {occurred.time ?? "Time unavailable"}
                  </p>
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    aria-label={`View details for ${transaction.merchantName ?? transaction.name}`}
                    aria-expanded={
                      selectedTransaction?.id === transaction.id
                    }
                    aria-controls="transaction-detail-sheet"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedTransaction(transaction);
                    }}
                    className="-m-1 flex max-w-full items-center gap-3 rounded-md p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <MerchantLogo
                      key={transaction.logoUrl ?? transaction.id}
                      src={transaction.logoUrl}
                      incoming={incoming}
                    />
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
                  </button>
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

      <Sheet
        open={selectedTransaction !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTransaction(null);
        }}
      >
        <SheetContent
          id="transaction-detail-sheet"
          className="w-[calc(100%-1rem)] overflow-y-auto p-0 sm:max-w-lg"
        >
          {selectedTransaction && (
            <TransactionDetails transaction={selectedTransaction} />
          )}
        </SheetContent>
      </Sheet>
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
  const allLabel =
    label === "Status"
      ? "All statuses"
      : `All ${label.toLocaleLowerCase()}s`;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-9 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MerchantLogo({
  src,
  incoming,
  large = false,
}: {
  src: string | null;
  incoming: boolean;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
  const pixels = large ? 48 : 32;

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-background",
        large ? "size-12" : "size-8",
        (!src || failed) &&
          (incoming
            ? "border-emerald-500/10 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-transparent bg-muted text-muted-foreground"),
      )}
    >
      {src && !failed ? (
        <Image
          src={src}
          alt=""
          width={pixels}
          height={pixels}
          sizes={`${pixels}px`}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon className={large ? "size-5" : "size-3.5"} aria-hidden="true" />
      )}
    </span>
  );
}

function TransactionDetails({ transaction }: { transaction: TransactionRow }) {
  const incoming = transaction.amount > 0;
  const merchant = transaction.merchantName ?? transaction.name;
  const occurred = formatTransactionDateTime(
    transaction.transactionAt,
    transaction.date,
  );
  const posted = formatTransactionDateTime(null, transaction.date).date;
  const authorized = transaction.authorizedDate
    ? formatTransactionDateTime(null, transaction.authorizedDate).date
    : null;
  const accountType = [
    titleCase(transaction.accountType),
    transaction.accountSubtype
      ? titleCase(transaction.accountSubtype)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <SheetHeader className="gap-4 border-b p-6 pr-14">
        <div className="flex items-start gap-3">
          <MerchantLogo
            key={transaction.logoUrl ?? transaction.id}
            src={transaction.logoUrl}
            incoming={incoming}
            large
          />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-lg">{merchant}</SheetTitle>
            <SheetDescription className="mt-1">
              {occurred.date}
              {occurred.time ? ` at ${occurred.time}` : " · Time unavailable"}
            </SheetDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p
              className={cn(
                "font-mono text-3xl font-semibold tracking-tight tabular-nums",
                incoming && "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {incoming ? "+" : ""}
              {formatCurrency(transaction.amount)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {transaction.currencyCode}
            </p>
          </div>
          <Badge
            variant={transaction.pending ? "secondary" : "outline"}
            className={cn(
              transaction.pending &&
                "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            )}
          >
            {transaction.pending ? "Pending" : "Posted"}
          </Badge>
        </div>
        {transaction.website && (
          <Button asChild variant="outline" className="w-fit">
            <a
              href={transaction.website}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              <Globe2 data-icon="inline-start" />
              {websiteHostname(transaction.website)}
              <ExternalLink data-icon="inline-end" />
            </a>
          </Button>
        )}
      </SheetHeader>

      <div className="grid gap-6 p-6">
        <DetailSection title="Transaction">
          <DetailRow
            label="Authorization"
            value={
              transaction.transactionAt
                ? `${occurred.date} at ${occurred.time}`
                : authorized ?? "Not provided"
            }
          />
          <DetailRow label="Posted date" value={posted} />
          <DetailRow
            label="Payment channel"
            value={titleCase(transaction.paymentChannel)}
          />
          {transaction.checkNumber && (
            <DetailRow label="Check number" value={transaction.checkNumber} />
          )}
          {transaction.transactionCode && (
            <DetailRow
              label="Transaction type"
              value={titleCase(transaction.transactionCode)}
            />
          )}
        </DetailSection>

        <DetailSection title="Merchant & classification">
          {transaction.merchantName && (
            <DetailRow label="Merchant" value={transaction.merchantName} />
          )}
          <DetailRow label="Bank description" value={transaction.name} />
          {transaction.originalDescription &&
            transaction.originalDescription !== transaction.name && (
              <DetailRow
                label="Original description"
                value={transaction.originalDescription}
              />
            )}
          <DetailRow label="Category" value={titleCase(transaction.category)} />
          <DetailRow
            label="Detailed category"
            value={titleCase(transaction.categoryDetailed)}
          />
          {transaction.location && (
            <DetailRow label="Location" value={transaction.location} />
          )}
          {transaction.storeNumber && (
            <DetailRow label="Store number" value={transaction.storeNumber} />
          )}
        </DetailSection>

        <DetailSection title="Account">
          <DetailRow label="Institution" value={transaction.institutionName} />
          <DetailRow
            label="Account"
            value={
              transaction.accountOfficialName ?? transaction.accountName
            }
          />
          {transaction.accountOfficialName &&
            transaction.accountOfficialName !== transaction.accountName && (
              <DetailRow label="Display name" value={transaction.accountName} />
            )}
          {transaction.accountMask && (
            <DetailRow
              label="Account number"
              value={`•••• ${transaction.accountMask}`}
            />
          )}
          <DetailRow label="Account type" value={accountType} />
        </DetailSection>

        <DetailSection title="Provider">
          <DetailRow
            label="Source"
            value={titleCase(transaction.accountSource)}
          />
          <DetailRow
            label="Last updated"
            value={formatDateTime(transaction.updatedAt)}
          />
          <DetailRow
            label="Transaction reference"
            value={
              <span className="break-all font-mono text-xs">
                {transaction.externalId}
              </span>
            }
          />
        </DetailSection>
      </div>
    </>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      <dl className="divide-y rounded-xl border bg-background px-4">
        {children}
      </dl>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium whitespace-normal">
        {value}
      </dd>
    </div>
  );
}
