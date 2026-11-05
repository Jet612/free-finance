const FALLBACK_TIME_ZONE = "America/New_York";

/**
 * NEXT_PUBLIC_APP_TIMEZONE is inlined by next.config.ts so client components
 * format dates the same way the server does. An invalid value must not take the
 * whole dashboard down, because Intl throws on an unknown time zone.
 */
export function appTimeZone(): string {
  const configured = (
    process.env.NEXT_PUBLIC_APP_TIMEZONE ?? process.env.APP_TIMEZONE
  )?.trim();
  if (!configured) return FALLBACK_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: configured });
    return configured;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

export function todayInAppTimezone(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: appTimeZone(),
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function monthStartInAppTimezone(now = new Date()): string {
  return `${todayInAppTimezone(now).slice(0, 7)}-01`;
}

export function subtractDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() - days);
  return shifted.toISOString().slice(0, 10);
}

/** The same day of the previous month, clamped to that month's last day. */
export function sameDayLastMonth(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  const target = new Date(Date.UTC(year, month - 2, Math.min(day, lastDay)));
  return target.toISOString().slice(0, 10);
}
