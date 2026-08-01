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
  return `${value.toLocaleString("en-US", { maximumFractionDigits })}%`;
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
  timeZone = process.env.APP_TIMEZONE ?? "America/New_York",
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
  timeZone = process.env.APP_TIMEZONE ?? "America/New_York",
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

export function titleCase(value: string | null): string {
  if (!value) return "Other";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
