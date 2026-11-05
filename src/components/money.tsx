import { formatAmount, formatSignedCurrency, formatWholeCurrency } from "@/lib/format";
import { splitMoneyText } from "@/lib/money-text";
import { cn } from "@/lib/utils";

/** Every amount goes through here, so "Hide amounts" can reach all of them. */
export function Money({
  value,
  whole = false,
  signed = false,
  className,
}: {
  value: number;
  whole?: boolean;
  signed?: boolean;
  className?: string;
}) {
  const text = signed
    ? formatSignedCurrency(value, whole)
    : whole
      ? value < 0
        ? `−${formatWholeCurrency(Math.abs(value))}`
        : formatWholeCurrency(value)
      : formatAmount(value);
  return <span className={cn("money", className)}>{text}</span>;
}

/** A sentence from the server, with its amounts still hideable. */
export function MoneyText({ value }: { value: string }) {
  return splitMoneyText(value).map((part, index) =>
    part.money ? (
      <span key={index} className="money">
        {part.text}
      </span>
    ) : (
      part.text
    ),
  );
}
