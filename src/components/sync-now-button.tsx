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
      variant="link"
      size="sm"
      className="h-auto rounded-sm p-0 text-xs"
      disabled={pending}
      aria-describedby="sync-now-status"
    >
      {pending ? (
        <>
          <LoaderCircle className="size-3.5 animate-spin" />
          Updating…
        </>
      ) : (
        <>
          <RefreshCw className="size-3.5" />
          Refresh
        </>
      )}
    </Button>
  );
}

export function SyncNowButton() {
  const [state, action] = useActionState(requestSync, initialState);

  return (
    <div className="grid justify-items-start gap-1 sm:justify-items-end">
      <form action={action}>
        <SubmitButton />
      </form>
      <div
        id="sync-now-status"
        aria-live="polite"
        className={
          state.message ? "text-[11px] text-muted-foreground" : "sr-only"
        }
      >
        {state.message ?? "Ready to refresh."}
      </div>
    </div>
  );
}
