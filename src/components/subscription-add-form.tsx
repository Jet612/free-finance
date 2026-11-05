"use client";

import { useActionState, useState } from "react";
import { Check, LoaderCircle, Plus } from "lucide-react";

import {
  addManualSubscription,
  type SubscriptionActionState,
} from "@/app/subscription-actions";
import { Button } from "@/components/ui/button";
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
import { formatCurrency, formatDate } from "@/lib/format";

type TransactionChoice = {
  id: number;
  merchant: string;
  amount: number;
  occurredAt: string;
  category: string | null;
};

const initialState: SubscriptionActionState = { status: "idle" };

async function pretendToSave(): Promise<SubscriptionActionState> {
  return { status: "saved", message: "Added for this demo visit." };
}

export function SubscriptionAddForm({
  transactions,
  demo = false,
}: {
  transactions: TransactionChoice[];
  demo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    demo ? pretendToSave : addManualSubscription,
    initialState,
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="secondary" className="h-9 bg-card text-card-foreground hover:bg-card/90">
          <Plus />
          Add a subscription
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[calc(100%-1rem)] sm:max-w-md">
        <SheetHeader className="border-b p-5 pr-12">
          <SheetTitle className="semiwide text-lg font-semibold">Add a subscription</SheetTitle>
          <SheetDescription>Pick a past charge and say how often it renews.</SheetDescription>
        </SheetHeader>
        {transactions.length ? (
          <form action={action} className="grid gap-5 p-5">
            <div className="grid gap-2">
              <Label htmlFor="subscription-transaction">Past charge</Label>
              <Select name="transactionId" required>
                <SelectTrigger id="subscription-transaction" className="h-10 w-full">
                  <SelectValue placeholder="Choose a charge" />
                </SelectTrigger>
                <SelectContent>
                  {transactions.map((transaction) => (
                    <SelectItem key={transaction.id} value={String(transaction.id)}>
                      {transaction.merchant}, {formatCurrency(transaction.amount)}, {formatDate(transaction.occurredAt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subscription-cadence">How often</Label>
              <Select name="cadence" defaultValue="monthly" required>
                <SelectTrigger id="subscription-cadence" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="h-10" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : <Check />}
              {pending ? "Adding" : "Add subscription"}
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
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            Charges will appear here once an account has updated.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
