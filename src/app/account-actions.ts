"use server";

import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth";
import { todayInAppTimezone } from "@/lib/timezone";

export type AccountActionState = {
  status: "idle" | "saved" | "error";
  message?: string;
};

const idSchema = z.coerce.number().int().positive();
const amountSchema = z.coerce.number().positive().max(100_000_000_000);
const MANUAL_INSTITUTION = "Added by you";

/** Leaves an account out of every total, or brings it back. */
export async function setAccountInNetWorth(
  id: number,
  included: boolean,
): Promise<void> {
  // Server Actions are public POST endpoints, so authorize inside the action.
  await requireSession();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return;

  await getDb().execute(sql`
    update public.accounts
    set in_net_worth = ${included === true}, updated_at = now()
    where id = ${parsedId.data}
  `);
  revalidatePath("/", "layout");
}

const manualSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["asset", "debt"]),
  amount: amountSchema,
});

/** Something a bank can't report: a home, a car, a loan from family. */
export async function addManualAccount(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  void _previousState;
  await requireSession();
  const parsed = manualSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Add a name and an amount above $0." };
  }

  const { amount, kind, name } = parsed.data;
  const balance = kind === "asset" ? amount : -amount;
  await getDb().transaction(async (tx) => {
    const [account] = await tx.execute(sql`
      insert into public.accounts (
        source, external_id, institution_name, name, account_type,
        current_balance, last_synced_at
      )
      values (
        'manual', ${randomUUID()}, ${MANUAL_INSTITUTION}, ${name},
        ${kind === "asset" ? "other" : "loan"}, ${balance}, now()
      )
      returning id
    `);
    // Dated back to the start of the trend: you didn't just gain a house, you just
    // told the app about it. A value holds until the next snapshot.
    await tx.execute(sql`
      insert into public.balance_snapshots (account_id, snapshot_date, balance)
      select
        ${(account as { id: number }).id},
        coalesce(
          (select min(snapshot_date) from public.balance_snapshots),
          ${todayInAppTimezone()}::date
        ),
        ${balance}
    `);
  });
  revalidatePath("/", "layout");
  return { status: "saved", message: `${name} added.` };
}

export async function updateManualAccount(
  id: number,
  amount: number,
): Promise<AccountActionState> {
  await requireSession();
  const parsedId = idSchema.safeParse(id);
  const parsedAmount = amountSchema.safeParse(amount);
  if (!parsedId.success || !parsedAmount.success) {
    return { status: "error", message: "Enter an amount above $0." };
  }

  await getDb().transaction(async (tx) => {
    const updated = await tx.execute(sql`
      update public.accounts
      set
        current_balance = case when current_balance < 0 then -1 else 1 end * ${parsedAmount.data}::numeric,
        last_synced_at = now(),
        updated_at = now()
      where id = ${parsedId.data} and source = 'manual'
      returning current_balance
    `);
    const balance = (updated[0] as { current_balance?: string } | undefined)?.current_balance;
    if (balance === undefined) return;
    await tx.execute(sql`
      insert into public.balance_snapshots (account_id, snapshot_date, balance)
      values (${parsedId.data}, ${todayInAppTimezone()}, ${balance})
      on conflict (account_id, snapshot_date) do update set balance = excluded.balance
    `);
  });
  revalidatePath("/", "layout");
  return { status: "saved" };
}

export async function removeManualAccount(id: number): Promise<void> {
  await requireSession();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return;

  await getDb().execute(sql`
    delete from public.accounts
    where id = ${parsedId.data} and source = 'manual'
  `);
  revalidatePath("/", "layout");
}
