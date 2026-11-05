import { formatCurrency, formatWholeCurrency } from "@/lib/format";

const OPEN = "";
const CLOSE = "";

/**
 * Sentences built on the server still need their amounts hidden on request, so
 * each amount is wrapped in private-use markers that MoneyText turns into a span.
 */
export function markMoney(value: number): string {
  return `${OPEN}${formatCurrency(value)}${CLOSE}`;
}

export function markWholeMoney(value: number): string {
  return `${OPEN}${formatWholeCurrency(value)}${CLOSE}`;
}

export type MoneyTextPart = { text: string; money: boolean };

export function splitMoneyText(value: string): MoneyTextPart[] {
  return value
    .split(new RegExp(`(${OPEN}[^${CLOSE}]*${CLOSE})`))
    .filter(Boolean)
    .map((part) =>
      part.startsWith(OPEN)
        ? { text: part.slice(1, -1), money: true }
        : { text: part, money: false },
    );
}
