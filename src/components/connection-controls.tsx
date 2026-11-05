"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Landmark,
  LoaderCircle,
  RefreshCw,
  TrendingUp,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  reconnectConnection,
  removeConnection,
  startConnection,
  type ConnectionActionState,
} from "@/app/connection-actions";
import { Button } from "@/components/ui/button";

const initialState: ConnectionActionState = { status: "idle" };

const IMPORT_POLL_MS = 4_000;
const IMPORT_POLL_LIMIT_MS = 3 * 60 * 1000;

function useRedirectOnSuccess(state: ConnectionActionState) {
  useEffect(() => {
    if (state.status === "redirect" && state.url) {
      window.location.assign(state.url);
    }
  }, [state]);
}

function ErrorMessage({ state }: { state: ConnectionActionState }) {
  if (state.status !== "error" || !state.message) return null;
  return (
    <p role="alert" className="text-xs leading-5 text-destructive">
      {state.message}
    </p>
  );
}

function PendingAwareButton({
  icon: Icon,
  label,
  variant = "default",
}: {
  icon: LucideIcon;
  label: string;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className="w-full">
      {pending ? <LoaderCircle className="animate-spin" /> : <Icon />}
      {pending ? "Opening Plaid…" : label}
    </Button>
  );
}

function AddConnectionForm({
  kind,
  label,
  icon,
  variant,
}: {
  kind: "bank" | "investment";
  label: string;
  icon: LucideIcon;
  variant?: "default" | "outline";
}) {
  const [state, action] = useActionState(startConnection, initialState);
  useRedirectOnSuccess(state);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="kind" value={kind} />
      <PendingAwareButton icon={icon} label={label} variant={variant} />
      <ErrorMessage state={state} />
    </form>
  );
}

export function AddConnectionButtons() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <AddConnectionForm
        kind="bank"
        label="Add a bank or credit card"
        icon={Landmark}
      />
      <AddConnectionForm
        kind="investment"
        label="Add an investment account"
        icon={TrendingUp}
        variant="outline"
      />
    </div>
  );
}

export function ReconnectButton({ itemId }: { itemId: number }) {
  const [state, action] = useActionState(reconnectConnection, initialState);
  useRedirectOnSuccess(state);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <PendingAwareButton icon={RefreshCw} label="Reconnect" />
      <ErrorMessage state={state} />
    </form>
  );
}

function ConfirmRemoveButton({ institution }: { institution: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" size="sm" disabled={pending}>
      {pending ? <LoaderCircle className="animate-spin" /> : <Unplug />}
      Remove {institution}
    </Button>
  );
}

export function RemoveConnectionButton({
  itemId,
  institution,
}: {
  itemId: number;
  institution: string;
}) {
  const [state, action] = useActionState(removeConnection, initialState);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => setConfirming(true)}
      >
        Remove
      </Button>
    );
  }

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <p className="max-w-xs text-xs leading-5 text-muted-foreground">
        This stops updates and takes these accounts out of your totals. Your past
        transactions stay here.
      </p>
      <div className="flex flex-wrap gap-2">
        <ConfirmRemoveButton institution={institution} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
        >
          Keep it
        </Button>
      </div>
      <ErrorMessage state={state} />
    </form>
  );
}

/** Refreshes the page until a newly connected bank finishes its first import. */
export function ImportWatcher() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), IMPORT_POLL_MS);
    const timeout = window.setTimeout(
      () => window.clearInterval(interval),
      IMPORT_POLL_LIMIT_MS,
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [router]);

  return null;
}
