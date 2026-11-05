"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, RefreshCw } from "lucide-react";

import { requestSync, type SyncActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";

const initialState: SyncActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-describedby="sync-now-status"
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
      {pending ? "Updating" : "Refresh"}
    </Button>
  );
}

export function SyncNowButton() {
  const [state, action] = useActionState(requestSync, initialState);
  return (
    <div className="flex items-center gap-2">
      <p
        id="sync-now-status"
        aria-live="polite"
        className={state.message ? "text-[0.8125rem] text-muted-foreground" : "sr-only"}
      >
        {state.message ?? "Ready to refresh."}
      </p>
      <form action={action}>
        <SubmitButton />
      </form>
    </div>
  );
}
