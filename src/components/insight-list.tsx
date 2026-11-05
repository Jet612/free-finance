"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";

import { MoneyText } from "@/components/money";
import { EmptyNote, Panel } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { rememberDismissed } from "@/lib/dismissals";
import { visibleInsights, type Insight, type InsightLevel } from "@/lib/insights";
import { cn } from "@/lib/utils";

const PHONE_LIMIT = 3;

const LEVELS: Record<InsightLevel, { icon: typeof Info; className: string; label: string }> = {
  urgent: { icon: TriangleAlert, className: "text-negative", label: "Urgent" },
  watch: { icon: CircleAlert, className: "text-warning", label: "Worth watching" },
  note: { icon: Info, className: "text-muted-foreground", label: "For your information" },
};

export function InsightList({
  insights,
  initiallyDismissed,
  basePath,
}: {
  insights: Insight[];
  initiallyDismissed: string[];
  basePath: string;
}) {
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  const [lastDismissed, setLastDismissed] = useState<Insight | null>(null);
  const [expanded, setExpanded] = useState(false);
  const shown = visibleInsights(insights, dismissed);
  const someHidden = insights.some((item) => dismissed.includes(item.id));

  function update(next: string[]) {
    setDismissed(next);
    rememberDismissed(next);
  }

  return (
    <Panel>
      {shown.length ? (
        <ul className={cn("divide-y", !expanded && "max-sm:[&>li:nth-child(n+4)]:hidden")}>
          {shown.map((insight) => {
            const level = LEVELS[insight.level];
            return (
              <li key={insight.id} className="flex items-start gap-3 px-4 py-3">
                <level.icon
                  className={cn("mt-0.5 size-[18px] shrink-0", level.className)}
                  aria-label={level.label}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-medium leading-snug">
                    <MoneyText value={insight.title} />
                  </p>
                  <p className="mt-0.5 text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
                    <MoneyText value={insight.detail} />
                  </p>
                  <div className="mt-1 flex items-center gap-4">
                    <Link
                      href={`${basePath}${insight.href}`}
                      className="inline-flex min-h-6 items-center text-[0.8125rem] font-medium underline underline-offset-3 [@media(pointer:coarse)]:min-h-11"
                    >
                      {insight.action}
                    </Link>
                    {insight.dismissible && (
                      <button
                        type="button"
                        onClick={() => {
                          update([...dismissed, insight.id]);
                          setLastDismissed(insight);
                        }}
                        className="inline-flex min-h-6 items-center rounded text-[0.8125rem] text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11"
                      >
                        Got it
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyNote
          title={someHidden ? "Nothing new" : "Nothing needs you today"}
          detail={someHidden ? "You've looked at everything here." : "Connections, budgets, and bills all look fine."}
        />
      )}
      {!expanded && shown.length > PHONE_LIMIT && (
        <div className="border-t sm:hidden">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="min-h-11 w-full px-4 text-left text-[0.8125rem] font-medium underline underline-offset-3"
          >
            Show {shown.length - PHONE_LIMIT} more
          </button>
        </div>
      )}
      {lastDismissed && (
        <p aria-live="polite" className="flex items-center justify-between gap-3 border-t px-4 py-2 text-[0.8125rem] text-muted-foreground">
          Hidden.
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              update(dismissed.filter((id) => id !== lastDismissed.id));
              setLastDismissed(null);
            }}
          >
            Undo
          </Button>
        </p>
      )}
    </Panel>
  );
}
