import { appTimeZone } from "@/lib/timezone";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatCompactCurrency(value: number): string {
  return compactCurrencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(
  value: number | null,
  maximumFractionDigits = 1,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-US", { maximumFractionDigits }).replace("-", "\u2212")}%`;
}

export function formatQuantity(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value < 1 ? 6 : 2,
  });
}

export function formatDate(value: Date | string | null): string {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(
  value: Date | string | null,
  timeZone = appTimeZone(),
): string {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

export function formatRelativeTime(
  value: Date | string | null,
  now = new Date(),
): string {
  if (!value) return "never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "at an unknown time";

  const differenceMs = date.getTime() - now.getTime();
  const absoluteMs = Math.abs(differenceMs);
  if (absoluteMs < 60_000) return "just now";

  const units = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ] as const;
  const [unit, milliseconds] =
    units.find(([, duration]) => absoluteMs >= duration) ?? units.at(-1)!;

  return new Intl.RelativeTimeFormat("en", { numeric: "always" }).format(
    Math.round(differenceMs / milliseconds),
    unit,
  );
}

export function formatTransactionDateTime(
  transactionAt: string | null,
  date: string,
  timeZone = appTimeZone(),
): { date: string; time: string | null } {
  if (!transactionAt) {
    return {
      date: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${date}T12:00:00Z`)),
      time: null,
    };
  }
  const value = new Date(transactionAt);
  return {
    date: new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone,
    }).format(value),
    time: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(value),
  };
}

export function formatMonth(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 7)}-15T12:00:00Z`));
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  cash: "Cash",
  cryptocurrency: "Crypto",
  derivative: "Options",
  equity: "Stocks",
  etf: "ETFs",
  "fixed income": "Bonds",
  loan: "Loans",
  "mutual fund": "Mutual funds",
  other: "Other",
};

export function assetTypeLabel(value: string): string {
  return ASSET_TYPE_LABELS[value.toLowerCase()] ?? titleCase(value);
}

export function titleCase(value: string | null): string {
  if (!value) return "Other";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const wholeCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Headline figures: nobody needs the cents on a net worth. */
export function formatWholeCurrency(value: number): string {
  return wholeCurrencyFormatter.format(Number.isFinite(value) ? value : 0);
}

/** For a change: always carries a sign, with a true minus. */
export function formatSignedCurrency(value: number, whole = false): string {
  const amount = (whole ? formatWholeCurrency : formatCurrency)(Math.abs(value));
  if (Math.abs(value) < (whole ? 0.5 : 0.005)) return amount;
  return `${value < 0 ? "−" : "+"}${amount}`;
}

/** A plain amount, with a true minus when it's negative. */
export function formatAmount(value: number): string {
  const amount = formatCurrency(Math.abs(value));
  return value < 0 ? `−${amount}` : amount;
}

/** Calendar dates are stored without a time, so they never shift by time zone. */
function calendarDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

export function formatShortDate(value: string, withYear = false): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(calendarDate(value));
}

export function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(calendarDate(value));
}

export function formatLongMonth(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(calendarDate(`${value.slice(0, 7)}-15`));
}

export function formatMonthYear(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(calendarDate(`${value.slice(0, 7)}-15`));
}

/** A heading for a day of transactions, relative to the owner's today. */
export function formatDayHeading(date: string, today: string): string {
  const days = Math.round(
    (calendarDate(today).getTime() - calendarDate(date).getTime()) / 86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
    timeZone: "UTC",
  }).format(calendarDate(date));
}

export function plural(count: number, noun: string, many = `${noun}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? noun : many}`;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ira: "IRA",
  "roth ira": "Roth IRA",
  "401k": "401(k)",
  "403b": "403(b)",
  hsa: "HSA",
  cd: "CD",
};

export function accountTypeLabel(value: string): string {
  const key = value.toLowerCase();
  return ACCOUNT_TYPE_LABELS[key] ?? key;
}
