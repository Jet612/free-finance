"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";

import {
  addManualSubscription,
  type SubscriptionActionState,
} from "@/app/subscription-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/format";

type TransactionChoice = {
  id: number;
  merchant: string;
  amount: number;
  occurredAt: string;
  category: string | null;
};

const initialState: SubscriptionActionState = { status: "idle" };

export function SubscriptionAddForm({
  transactions,
}: {
  transactions: TransactionChoice[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    addManualSubscription,
    initialState,
  );

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
        {transactions.length ? (
          <form action={action} className="grid gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="subscription-transaction">Transaction</Label>
              <Select
                name="transactionId"
                required
              >
                <SelectTrigger
                  id="subscription-transaction"
                  className="h-9 w-full"
                >
                  <SelectValue placeholder="Select a recent transaction" />
                </SelectTrigger>
                <SelectContent>
                  {transactions.map((transaction) => (
                    <SelectItem
                      key={transaction.id}
                      value={String(transaction.id)}
                    >
                      {transaction.merchant} ·{" "}
                      {formatCurrency(transaction.amount)} ·{" "}
                      {formatDate(transaction.occurredAt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subscription-cadence">Frequency</Label>
              <Select
                name="cadence"
                defaultValue="monthly"
                required
              >
                <SelectTrigger
                  id="subscription-cadence"
                  className="h-9 w-full"
                >
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
            {state.message && (
              <p
                aria-live="polite"
                className={
                  state.status === "error"
                    ? "text-xs text-destructive md:col-span-3"
                    : "text-xs text-emerald-600 dark:text-emerald-400 md:col-span-3"
                }
              >
                {state.message}
              </p>
            )}
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sync at least one debit transaction before adding a subscription.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
