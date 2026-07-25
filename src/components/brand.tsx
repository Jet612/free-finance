import { ChartNoAxesCombined } from "lucide-react";

export function Brand({
  compact = false,
  name = "Free Finance",
}: {
  compact?: boolean;
  name?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <ChartNoAxesCombined className="size-[18px]" strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block text-sm font-semibold tracking-tight">
            {name}
          </span>
          <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Private ledger
          </span>
        </span>
      )}
    </div>
  );
}
