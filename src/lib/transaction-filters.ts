import type { TransactionRow } from "@/lib/detail-data";

export const PERIODS = [
  { value: "mtd", label: "This month" },
  { value: "last30Days", label: "Last 30 days" },
  { value: "last90Days", label: "Last 90 days" },
  { value: "ytd", label: "This year" },
  { value: "all", label: "All time" },
] as const;

export type Period = (typeof PERIODS)[number]["value"];
export type TransactionStatus = "all" | "pending" | "posted";

export type TransactionFilters = {
  q: string;
  period: Period;
  /** A specific calendar month, as YYYY-MM. Takes the place of the period. */
  month: string | null;
  category: string;
  account: string;
  status: TransactionStatus;
};

export const DEFAULT_FILTERS: TransactionFilters = {
  q: "",
  period: "last30Days",
  month: null,
  category: "all",
  account: "all",
  status: "all",
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseTransactionFilters(params: SearchParams): TransactionFilters {
  const q = first(params.q)?.trim() ?? "";
  const category = first(params.category) ?? "all";
  const account = first(params.account) ?? "all";
  const status = first(params.status);
  const month = first(params.month);
  const period = first(params.period);
  const validPeriod = PERIODS.find((item) => item.value === period)?.value;
  // A link to something specific shouldn't miss it because it's a little old.
  const deepLink =
    Boolean(q) || category !== "all" || account !== "all" || Boolean(first(params.open));

  return {
    q,
    period: validPeriod ?? (deepLink ? "all" : DEFAULT_FILTERS.period),
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? "") ? (month ?? null) : null,
    category,
    account,
    status: status === "pending" || status === "posted" ? status : "all",
  };
}

export function transactionFiltersQuery(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.month) params.set("month", filters.month);
  else if (filters.period !== DEFAULT_FILTERS.period) params.set("period", filters.period);
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.account !== "all") params.set("account", filters.account);
  if (filters.status !== "all") params.set("status", filters.status);
  return params.toString();
}

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return (
    Boolean(filters.q || filters.month) ||
    filters.period !== DEFAULT_FILTERS.period ||
    filters.category !== "all" ||
    filters.account !== "all" ||
    filters.status !== "all"
  );
}

export function filterTransactions(
  transactions: TransactionRow[],
  filters: TransactionFilters,
  periodStarts: Record<Exclude<Period, "all">, string>,
): TransactionRow[] {
  const query = filters.q.toLocaleLowerCase();
  const start = filters.period === "all" ? null : periodStarts[filters.period];

  return transactions.filter((item) => {
    if (filters.month) {
      if (!item.date.startsWith(filters.month)) return false;
    } else if (start && item.date < start) {
      return false;
    }
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (filters.account !== "all" && item.accountName !== filters.account) return false;
    if (filters.status === "pending" && !item.pending) return false;
    if (filters.status === "posted" && item.pending) return false;
    if (!query) return true;
    return [
      item.merchantName,
      item.name,
      item.accountName,
      item.category,
      item.categoryDetailed,
      item.originalDescription,
      Math.abs(item.amount).toFixed(2),
    ].some((value) => value?.toLocaleLowerCase().replaceAll("_", " ").includes(query));
  });
}

function csvCell(value: string | number | null): string {
  const text = String(value ?? "");
  // A leading =, +, -, or @ would run as a formula when opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value !== "number" ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function transactionsCsv(transactions: TransactionRow[]): string {
  const header = ["Date", "Merchant", "Description", "Category", "Account", "Amount", "Status"];
  const rows = transactions.map((item) => [
    item.date,
    item.merchantName ?? item.name,
    item.name,
    item.category,
    item.accountName,
    item.amount,
    item.pending ? "Pending" : "Posted",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

/**
 * The same rules as the SQL in finance-sql.ts, so a filtered list can never
 * disagree with the Spending page. Moving your own money isn't spending, and a
 * charge doesn't count until it posts.
 */
export function countsAsCashFlow(item: TransactionRow): boolean {
  return (
    !item.pending &&
    !item.ignored &&
    !["TRANSFER_IN", "TRANSFER_OUT"].includes(item.category ?? "") &&
    item.categoryDetailed !== "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"
  );
}

export function isIncome(item: TransactionRow): boolean {
  return item.amount > 0 && (item.category ?? "INCOME") === "INCOME";
}

/** Income and spending for a set of transactions. A refund lowers spending. */
export function cashFlowTotals(transactions: TransactionRow[]) {
  let income = 0;
  let outflow = 0;
  let notCounted = 0;
  for (const item of transactions) {
    if (!countsAsCashFlow(item)) notCounted += 1;
    else if (isIncome(item)) income += item.amount;
    else outflow -= item.amount;
  }
  return { income, spending: Math.max(outflow, 0), notCounted };
}
