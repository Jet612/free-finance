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
      <span className="flex size-10 items-center justify-center rounded-full bg-primary/85 text-primary-foreground">
        <ChartNoAxesCombined className="size-[19px]" strokeWidth={2.1} />
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block text-[15px] font-semibold tracking-tight">
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
