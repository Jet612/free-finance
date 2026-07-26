import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  change,
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  change?: number | null;
}) {
  const positive = (change ?? 0) > 0;
  const negative = (change ?? 0) < 0;
  const ChangeIcon = positive
    ? ArrowUpRight
    : negative
      ? ArrowDownRight
      : Minus;

  return (
    <Card className="relative overflow-hidden border-border/70 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
          {value}
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          {change !== undefined && change !== null && (
            <ChangeIcon
              className={cn(
                "size-3.5",
                positive && "text-emerald-600 dark:text-emerald-400",
                negative && "text-rose-600 dark:text-rose-400",
              )}
            />
          )}
          <span>{detail}</span>
        </div>
      </CardContent>
    </Card>
  );
}
