"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth";
import { getSubscriptionsData } from "@/lib/detail-data";
import {
  subscriptionStreamKey,
  type SubscriptionCandidate,
} from "@/lib/subscription-detection";

export type SubscriptionActionState = {
  status: "idle" | "saved" | "error";
  message?: string;
};

const subscriptionCadenceSchema = z.enum([
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "annual",
]);
const subscriptionRuleIdSchema = z.coerce.number().int().positive();

export async function addManualSubscription(
  _previousState: SubscriptionActionState,
  formData: FormData,
): Promise<SubscriptionActionState> {
  void _previousState;
  // Server Actions are public POST endpoints, even when their form is private.
  await requireSession();
  const parsed = z
    .object({
      transactionId: z.coerce.number().int().positive(),
      cadence: subscriptionCadenceSchema,
    })
    .safeParse({
      transactionId: formData.get("transactionId"),
      cadence: formData.get("cadence"),
    });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Choose a transaction and how often it renews.",
    };
  }

  const db = getDb();
  // Resolve the transaction server-side instead of trusting merchant, amount,
  // or category values from the form.
  const rows = await db.execute(sql`
    select
      id,
      coalesce(merchant_name, name) as merchant,
      name as description,
      category_primary,
      category_detailed,
      abs(amount)::float8 as amount,
      coalesce(
        transaction_at,
        transaction_date::timestamp at time zone ${process.env.APP_TIMEZONE ?? "America/New_York"}
      ) as occurred_at
    from public.transactions
    where id = ${parsed.data.transactionId}
      and amount < 0
      and pending = false
    limit 1
  `);
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return {
      status: "error",
      message: "That transaction is no longer available.",
    };
  }

  const candidate: SubscriptionCandidate = {
    merchant: String(row.merchant ?? ""),
    description: String(row.description ?? ""),
    category: row.category_primary ? String(row.category_primary) : null,
    categoryDetailed: row.category_detailed
      ? String(row.category_detailed)
      : null,
    transactionCode: null,
    amount: Number(row.amount),
    occurredAt: new Date(String(row.occurred_at)),
  };
  const streamKey = subscriptionStreamKey(candidate);
  if (
    streamKey.startsWith(":") ||
    !Number.isFinite(candidate.amount) ||
    candidate.amount <= 0 ||
    !Number.isFinite(candidate.occurredAt.getTime())
  ) {
    return {
      status: "error",
      message: "That transaction does not have enough usable information.",
    };
  }

  await db.execute(sql`
    insert into public.subscription_rules (
      stream_key,
      rule_type,
      merchant_name,
      category_primary,
      category_detailed,
      cadence,
      amount,
      last_charged_at,
      source_transaction_id,
      updated_at
    )
    values (
      ${streamKey},
      'included',
      ${candidate.merchant},
      ${candidate.category},
      ${candidate.categoryDetailed},
      ${parsed.data.cadence},
      ${candidate.amount},
      ${candidate.occurredAt},
      ${parsed.data.transactionId},
      now()
    )
    on conflict (stream_key) do update
    set
      rule_type = 'included',
      merchant_name = excluded.merchant_name,
      category_primary = excluded.category_primary,
      category_detailed = excluded.category_detailed,
      cadence = excluded.cadence,
      amount = excluded.amount,
      last_charged_at = excluded.last_charged_at,
      source_transaction_id = excluded.source_transaction_id,
      updated_at = now()
  `);
  revalidatePath("/subscriptions");
  return { status: "saved", message: "Subscription added." };
}

const dismissSubscriptionSchema = z.object({
  streamKey: z.string().trim().min(1).max(700),
});

export async function dismissSubscription(formData: FormData): Promise<void> {
  await requireSession();
  const parsed = dismissSubscriptionSchema.safeParse({
    streamKey: formData.get("streamKey"),
  });
  if (!parsed.success) return;

  // Re-derive the row server-side so merchant/category labels never come from
  // editable hidden inputs.
  const data = await getSubscriptionsData();
  const subscription = data.subscriptions.find(
    (item) =>
      item.streamKey === parsed.data.streamKey && item.source === "Automatic",
  );
  if (!subscription) return;

  const db = getDb();
  await db.execute(sql`
    insert into public.subscription_rules (
      stream_key,
      rule_type,
      merchant_name,
      category_primary,
      updated_at
    )
    values (
      ${subscription.streamKey},
      'excluded',
      ${subscription.merchant},
      ${subscription.category},
      now()
    )
    on conflict (stream_key) do update
    set
      rule_type = 'excluded',
      merchant_name = excluded.merchant_name,
      category_primary = excluded.category_primary,
      category_detailed = null,
      cadence = null,
      amount = null,
      last_charged_at = null,
      source_transaction_id = null,
      updated_at = now()
  `);
  revalidatePath("/subscriptions");
}

export async function removeManualSubscription(
  formData: FormData,
): Promise<void> {
  await requireSession();
  const parsed = subscriptionRuleIdSchema.safeParse(formData.get("ruleId"));
  if (!parsed.success) return;

  const db = getDb();
  // Convert to an exclusion instead of deleting so the auto-detector cannot
  // immediately recreate the stream.
  await db.execute(sql`
    update public.subscription_rules
    set
      rule_type = 'excluded',
      cadence = null,
      amount = null,
      last_charged_at = null,
      source_transaction_id = null,
      updated_at = now()
    where id = ${parsed.data}
      and rule_type = 'included'
  `);
  revalidatePath("/subscriptions");
}

export async function restoreSubscriptionRule(
  formData: FormData,
): Promise<void> {
  await requireSession();
  const parsed = subscriptionRuleIdSchema.safeParse(formData.get("ruleId"));
  if (!parsed.success) return;

  const db = getDb();
  await db.execute(sql`
    delete from public.subscription_rules
    where id = ${parsed.data}
      and rule_type = 'excluded'
  `);
  revalidatePath("/subscriptions");
}
