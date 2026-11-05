"use client";

import { useState } from "react";
import { Check, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DemoSyncNowButton() {
  const [synced, setSynced] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <p aria-live="polite" className={synced ? "text-[0.8125rem] text-muted-foreground" : "sr-only"}>
        {synced ? "Sample data is up to date." : "Ready to refresh."}
      </p>
      <Button type="button" variant="ghost" size="sm" onClick={() => setSynced(true)}>
        {synced ? <Check /> : <RefreshCw />}
        Refresh
      </Button>
    </div>
  );
}

export function DemoSubscriptionRuleButton({
  mode,
  merchant,
}: {
  mode: "dismiss" | "remove";
  merchant: string;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-muted-foreground"
      disabled={saved}
      aria-label={`${mode === "dismiss" ? "Hide" : "Remove"} ${merchant}`}
      onClick={() => setSaved(true)}
    >
      {saved ? <Check /> : mode === "dismiss" ? "Hide" : "Remove"}
    </Button>
  );
}
