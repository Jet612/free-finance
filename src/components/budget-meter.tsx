import type { BudgetState } from "@/lib/insights";
import { cn } from "@/lib/utils";

/** How much of a budget is gone, with a tick for how far through the month we are. */
export function BudgetMeter({
  percent,
  pendingPercent = 0,
  monthProgress,
  state,
  label,
  className,
}: {
  percent: number;
  /** Charges that haven't posted, shown as a paler stretch after what's spent. */
  pendingPercent?: number;
  monthProgress: number;
  state: BudgetState;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(Math.round(percent), 100)}
      className={cn("relative h-2 rounded-full bg-secondary", className)}
    >
      {pendingPercent > 0 && (
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
          style={{ width: `${Math.min(percent + pendingPercent, 100)}%` }}
        />
      )}
      <span
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          state === "over"
            ? "bg-negative"
            : state === "ahead"
              ? "bg-warning-fill"
              : "bg-primary",
        )}
        style={{ width: `${Math.min(percent > 0 ? Math.max(percent, 1) : 0, 100)}%` }}
      />
      <span
        aria-hidden="true"
        title="Today"
        className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground ring-2 ring-card"
        style={{ left: `${monthProgress}%` }}
      />
    </div>
  );
}
