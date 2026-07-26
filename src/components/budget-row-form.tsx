"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, LoaderCircle, Save } from "lucide-react";

import {
  saveBudget,
  type BudgetActionState,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: BudgetActionState = { status: "idle" };

export function BudgetRowForm({
  category,
  monthlyLimit,
}: {
  category: string;
  monthlyLimit: number | null;
}) {
  const [state, action] = useActionState(saveBudget, initialState);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="category" value={category} />
      <label className="relative">
        <span className="sr-only">Monthly budget</span>
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          $
        </span>
        <Input
          name="monthlyLimit"
          type="number"
          inputMode="decimal"
          min="0.01"
          max="100000000"
          step="0.01"
          defaultValue={monthlyLimit ?? ""}
          placeholder="Set budget"
          className="h-8 w-28 pl-6 text-right font-mono text-xs"
          required
        />
      </label>
      <SaveButton saved={state.status === "saved"} />
      <span className="sr-only" aria-live="polite">
        {state.message}
      </span>
    </form>
  );
}

function SaveButton({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="icon-sm"
      variant="ghost"
      aria-label="Save budget"
      disabled={pending}
    >
      {pending ? (
        <LoaderCircle className="animate-spin" />
      ) : saved ? (
        <Check className="text-emerald-600" />
      ) : (
        <Save />
      )}
    </Button>
  );
}
