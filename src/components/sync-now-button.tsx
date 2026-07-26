"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  requestSync,
  type SyncActionState,
} from "@/app/actions";
import { Button } from "@/components/ui/button";

const initialState: SyncActionState = { status: "idle" };

function SubmitButton({ configured }: { configured: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      disabled={!configured || pending}
      aria-describedby="sync-now-status"
    >
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" />
          Queuing sync
        </>
      ) : (
        <>
          <RefreshCw />
          Sync now
        </>
      )}
    </Button>
  );
}

export function SyncNowButton({
  configured,
  completedSyncAt,
  failedSyncAt,
}: {
  configured: boolean;
  completedSyncAt: string | null;
  failedSyncAt: string | null;
}) {
  const router = useRouter();
  const [state, action] = useActionState(requestSync, initialState);
  const [expiredQueue, setExpiredQueue] = useState<string | null>(null);
  const queuedAt = state.queuedAt ? Date.parse(state.queuedAt) : 0;
  const completed =
    state.status === "queued" &&
    Boolean(completedSyncAt) &&
    Date.parse(completedSyncAt ?? "") >= queuedAt;
  const failed =
    state.status === "queued" &&
    Boolean(failedSyncAt) &&
    Date.parse(failedSyncAt ?? "") >= queuedAt;

  const pollExpired =
    Boolean(state.queuedAt) && expiredQueue === state.queuedAt;

  useEffect(() => {
    if (state.status !== "queued" || completed || failed) return;

    const interval = window.setInterval(() => router.refresh(), 10_000);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      setExpiredQueue(state.queuedAt ?? null);
    }, 90_000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [completed, failed, router, state.queuedAt, state.status]);

  let message = configured
    ? "Every 3 hours · 10-minute manual cooldown"
    : "Add a GitHub sync token to enable";
  if (state.message) message = state.message;
  if (completed) message = "Sync complete. Dashboard data is current.";
  if (failed) message = "A provider failed. Check Connections for details.";
  if (pollExpired) {
    message = "Sync is taking longer than usual. Reload in a moment.";
  }

  return (
    <div className="grid justify-items-start gap-1.5 sm:justify-items-end">
      <form action={action}>
        <SubmitButton configured={configured} />
      </form>
      <div
        id="sync-now-status"
        aria-live="polite"
        className="flex min-h-4 items-center gap-1 text-[11px] text-muted-foreground"
      >
        <span>{message}</span>
        {state.runUrl && state.status === "queued" && (
          <a
            href={state.runUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
          >
            Run
            <ExternalLink className="size-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}
