"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Ellipsis, LoaderCircle, Plus } from "lucide-react";

import {
  addManualAccount,
  removeManualAccount,
  setAccountInNetWorth,
  updateManualAccount,
  type AccountActionState,
} from "@/app/account-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const initialState: AccountActionState = { status: "idle" };

async function pretendToSave(): Promise<AccountActionState> {
  return { status: "saved", message: "The demo doesn't save this. In your own copy, it joins your net worth." };
}

export function AddManualAccount({ demo = false }: { demo?: boolean }) {
  const [kind, setKind] = useState("asset");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: AccountActionState, form: FormData) => {
      if (demo) return pretendToSave();
      const result = await addManualAccount(previous, form).catch(
        (): AccountActionState => ({
          status: "error",
          message: "That didn't save. Check your connection and try again.",
        }),
      );
      if (result.status === "saved") setOpen(false);
      return result;
    },
    initialState,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          <Plus />
          Add a home, car, or other asset
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[calc(100%-1rem)] sm:max-w-md">
        <SheetHeader className="border-b p-5 pr-12">
          <SheetTitle className="semiwide text-lg font-semibold">Add something a bank can&apos;t report</SheetTitle>
          <SheetDescription>
            A home, a car, or a loan from family. You update its value whenever you like.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="grid gap-5 p-5">
          <div className="grid gap-2">
            <Label htmlFor="manual-name">Name</Label>
            <Input id="manual-name" name="name" required maxLength={80} placeholder="Our house" className="h-10" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-kind">Is it something you own or owe?</Label>
            <Select name="kind" value={kind} onValueChange={setKind} required>
              <SelectTrigger id="manual-kind" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asset">Something I own</SelectItem>
                <SelectItem value="debt">Something I owe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-amount">
              {kind === "asset" ? "What it\u2019s worth today" : "What you owe today"}
            </Label>
            <Input
              id="manual-amount"
              name="amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              className="tnum h-10"
            />
          </div>
          <Button type="submit" className="h-10" disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
            {pending ? "Adding" : kind === "asset" ? "Add to net worth" : "Add this debt"}
          </Button>
          {state.message && (
            <p
              aria-live="polite"
              className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-positive"}
            >
              {state.message}
            </p>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Quiet controls for one account: leave it out, or edit one you added. */
export function AccountRowActions({
  id,
  name,
  included,
  manual,
  value,
}: {
  id: number;
  name: string;
  included: boolean;
  manual: boolean;
  value: number;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(Math.abs(value)));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);

  /** A dropped connection throws, and must not take the page down with it. */
  function attempt(run: () => Promise<unknown>) {
    setFailed(false);
    startTransition(async () => {
      await run().catch(() => setFailed(true));
    });
  }

  function save() {
    const next = Number(amount);
    if (!Number.isFinite(next) || next <= 0) {
      setError("Enter an amount above $0.");
      return;
    }
    setError(null);
    setEditing(false);
    attempt(() => updateManualAccount(id, next));
  }

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center justify-end gap-1.5 px-2 text-[0.8125rem]">
        <span>Remove {name} and its history?</span>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            setConfirming(false);
            attempt(() => removeManualAccount(id));
          }}
        >
          Remove
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Keep it
        </Button>
      </span>
    );
  }

  if (editing) {
    return (
      <span className="flex flex-wrap items-center justify-end gap-1.5 px-2">
        {error && <span role="alert" className="text-[0.8125rem] text-destructive">{error}</span>}
        <label className="relative">
          <span className="sr-only">New value for {name}</span>
          <Input
            autoFocus
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={amount}
            aria-invalid={error !== null}
            onChange={(event) => setAmount(event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") setEditing(false);
            }}
            className="tnum h-8 w-28 text-right"
          />
        </label>
        <Button type="button" size="sm" onClick={save}>Save</Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setConfirming(true);
          }}
        >
          Remove
        </Button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1 pr-2">
      {failed && (
        <span role="alert" className="text-[0.8125rem] text-destructive">
          Didn&apos;t save
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label={`Options for ${name}`}
            disabled={pending}
          >
            {pending ? <LoaderCircle className="animate-spin" /> : <Ellipsis />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {manual && (
            <DropdownMenuItem onSelect={() => setEditing(true)}>Update value</DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => attempt(() => setAccountInNetWorth(id, !included))}
          >
            {included ? "Leave out of totals" : "Count in totals"}
          </DropdownMenuItem>
          {manual && (
            <DropdownMenuItem onSelect={() => setConfirming(true)}>Remove</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
