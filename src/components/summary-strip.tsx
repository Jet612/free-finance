import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type SummaryItem = {
  label: string;
  value: string;
  detail?: string;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "negative";
};

export function SummaryStrip({ items }: { items: SummaryItem[] }) {
  return (
    <section className="grid overflow-hidden rounded-xl border bg-card/70 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "relative min-w-0 px-5 py-4",
            index > 0 && "border-t md:border-l md:border-t-0",
            index === 2 && "md:border-l-0 md:border-t xl:border-l xl:border-t-0",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {item.label}
            </p>
            {item.icon && (
              <item.icon
                className="size-4 text-muted-foreground"
                strokeWidth={1.8}
              />
            )}
          </div>
          <p
            className={cn(
              "mt-2 truncate font-mono text-xl font-medium tracking-tight tabular-nums",
              item.tone === "positive" && "text-emerald-600 dark:text-emerald-400",
              item.tone === "negative" && "text-red-600 dark:text-red-400",
            )}
          >
            {item.value}
          </p>
          {item.detail && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {item.detail}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
