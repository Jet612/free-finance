"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle, Undo2 } from "lucide-react";

import {
  dismissSubscription,
  removeManualSubscription,
  restoreSubscriptionRule,
} from "@/app/subscription-actions";
import { Button } from "@/components/ui/button";

type RuleButtonProps =
  | { mode: "dismiss"; streamKey: string; merchant: string; ruleId?: never }
  | { mode: "remove" | "restore"; ruleId: number; merchant: string; streamKey?: never };

export function SubscriptionRuleButton(props: RuleButtonProps) {
  const action = {
    dismiss: dismissSubscription,
    remove: removeManualSubscription,
    restore: restoreSubscriptionRule,
  }[props.mode];

  return (
    <form action={action}>
      {props.mode === "dismiss" ? (
        <input type="hidden" name="streamKey" value={props.streamKey} />
      ) : (
        <input type="hidden" name="ruleId" value={props.ruleId} />
      )}
      <RuleSubmitButton mode={props.mode} merchant={props.merchant} />
    </form>
  );
}

function RuleSubmitButton({
  mode,
  merchant,
}: {
  mode: RuleButtonProps["mode"];
  merchant: string;
}) {
  const { pending } = useFormStatus();
  const label = mode === "dismiss" ? `Hide ${merchant}` : `Remove ${merchant}`;

  if (mode === "restore") {
    return (
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Undo2 />}
        Show again
      </Button>
    );
  }
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      className="text-muted-foreground"
      disabled={pending}
      aria-label={label}
    >
      {pending ? <LoaderCircle className="animate-spin" /> : null}
      {mode === "dismiss" ? "Hide" : "Remove"}
    </Button>
  );
}
