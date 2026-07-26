"use client";

import { useFormStatus } from "react-dom";
import { EyeOff, LoaderCircle, Trash2, Undo2 } from "lucide-react";

import {
  dismissSubscription,
  removeManualSubscription,
  restoreSubscriptionRule,
} from "@/app/subscription-actions";
import { Button } from "@/components/ui/button";

type RuleButtonProps =
  | { mode: "dismiss"; streamKey: string; ruleId?: never }
  | { mode: "remove" | "restore"; ruleId: number; streamKey?: never };

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
      <RuleSubmitButton mode={props.mode} />
    </form>
  );
}

function RuleSubmitButton({ mode }: { mode: RuleButtonProps["mode"] }) {
  const { pending } = useFormStatus();
  const labels = {
    dismiss: "Not a subscription",
    remove: "Remove",
    restore: "Restore",
  } as const;
  const Icon =
    mode === "dismiss" ? EyeOff : mode === "restore" ? Undo2 : Trash2;

  return (
    <Button
      type="submit"
      size="sm"
      variant={mode === "remove" ? "destructive" : "ghost"}
      disabled={pending}
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <Icon />}
      {pending ? "Saving…" : labels[mode]}
    </Button>
  );
}
