"use client";

import { type FormEvent, useState } from "react";
import {
  Check,
  EyeOff,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/format";

export function DemoSyncNowButton() {
  const [synced, setSynced] = useState(false);

  return (
    <div className="grid justify-items-start gap-1 sm:justify-items-end">
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto rounded-sm p-0 text-xs"
        onClick={() => setSynced(true)}
        aria-describedby="demo-sync-status"
      >
        {synced ? <Check className="size-3.5" /> : <RefreshCw className="size-3.5" />}
        {synced ? "Up to date" : "Sync now"}
      </Button>
      <div
        id="demo-sync-status"
        aria-live="polite"
        className={synced ? "text-[11px] text-muted-foreground" : "sr-only"}
      >
        Sample data refreshed.
      </div>
    </div>
  );
}

export function DemoBudgetRowForm({
  category,
  monthlyLimit,
}: {
  category: string;
  monthlyLimit: number | null;
}) {
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <label className="relative">
        <span className="sr-only">Monthly budget for {category}</span>
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
      <Button
        type="submit"
        size="icon-sm"
        variant="ghost"
        aria-label="Save demo budget"
      >
        {saved ? <Check className="text-emerald-600" /> : <Save />}
      </Button>
      <span className="sr-only" aria-live="polite">
        {saved ? "Saved for this demo visit" : ""}
      </span>
    </form>
  );
}

export function DemoSubscriptionRuleButton({
  mode,
}: {
  mode: "dismiss" | "remove";
}) {
  const [saved, setSaved] = useState(false);
  const Icon = mode === "dismiss" ? EyeOff : Trash2;

  return (
    <Button
      type="button"
      size="sm"
      variant={mode === "remove" ? "destructive" : "ghost"}
      disabled={saved}
      onClick={() => setSaved(true)}
    >
      {saved ? <Check /> : <Icon />}
      {saved ? "Updated" : mode === "dismiss" ? "Not a subscription" : "Remove"}
    </Button>
  );
}

type TransactionChoice = {
  id: number;
  merchant: string;
  amount: number;
  occurredAt: string;
  category: string | null;
};

export function DemoSubscriptionAddForm({
  transactions,
}: {
  transactions: TransactionChoice[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    window.setTimeout(() => {
      setPending(false);
      setMessage("Subscription added for this demo visit.");
    }, 400);
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpen(true)}>
          <Plus />
          Add subscription
        </Button>
      </div>
    );
  }

  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4 border-b">
        <div>
          <CardTitle>Add from a transaction</CardTitle>
          <CardDescription className="mt-1">
            Choose a synced debit and tell Free Finance how often it renews.
          </CardDescription>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Close add subscription form"
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
      </CardHeader>
      <CardContent className="pt-5">
        <form
          onSubmit={submit}
          className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end"
        >
          <div className="grid gap-2">
            <Label htmlFor="demo-subscription-transaction">Transaction</Label>
            <Select name="transactionId" required>
              <SelectTrigger
                id="demo-subscription-transaction"
                className="h-9 w-full"
              >
                <SelectValue placeholder="Select a recent transaction" />
              </SelectTrigger>
              <SelectContent>
                {transactions.map((transaction) => (
                  <SelectItem key={transaction.id} value={String(transaction.id)}>
                    {transaction.merchant} · {formatCurrency(transaction.amount)} ·{" "}
                    {formatDate(transaction.occurredAt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="demo-subscription-cadence">Frequency</Label>
            <Select name="cadence" defaultValue="monthly" required>
              <SelectTrigger id="demo-subscription-cadence" className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="h-9" disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}
            {pending ? "Adding…" : "Add"}
          </Button>
          {message && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 md:col-span-3" aria-live="polite">
              {message}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
