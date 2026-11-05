"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { runSync } from "@/lib/sync/engine";

export type SyncActionState = {
  status: "idle" | "done" | "waiting" | "error";
  message?: string;
};

export type BudgetActionState = {
  status: "idle" | "saved" | "error";
  message?: string;
};

/** The daily sync is automatic; this only limits extra refreshes by hand. */
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

export async function requestSync(
  _previousState: SyncActionState,
  _formData: FormData,
): Promise<SyncActionState> {
  void _previousState;
  void _formData;
  // Server Actions are public POST endpoints, so authorize inside the action.
  await requireSession();

  const rows = await getDb().execute(sql`
    select last_attempt_at, status::text as status
    from public.sync_states
    where source = 'plaid'
  `);
  const state = rows[0] as
    | { last_attempt_at?: Date | string | null; status?: string }
    | undefined;
  const lastAttempt = state?.last_attempt_at
    ? new Date(state.last_attempt_at).getTime()
    : 0;
  const remainingMs = REFRESH_COOLDOWN_MS - (Date.now() - lastAttempt);
  if (remainingMs > 0) {
    const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    return {
      status: "waiting",
      message:
        state?.status === "running"
          ? "An update is already running."
          : `You can refresh again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const outcome = await runSync("manual");
  revalidatePath("/", "layout");

  switch (outcome.status) {
    case "success":
      return { status: "done", message: "Everything is up to date." };
    case "partial":
    case "failed":
      return {
        status: "error",
        message: "Some accounts couldn't update. See Connections for details.",
      };
    case "skipped":
      return {
        status: "waiting",
        message:
          outcome.reason === "no-connections"
            ? "Connect an account first."
            : outcome.reason === "not-configured"
              ? "Finish setup on the Connections page first."
              : "An update is already running.",
      };
  }
}

const budgetSchema = z.object({
  category: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Z0-9_ &-]+$/),
  monthlyLimit: z.coerce.number().positive().max(100_000_000),
});

export async function saveBudget(
  _previousState: BudgetActionState,
  formData: FormData,
): Promise<BudgetActionState> {
  void _previousState;
  // The form lives behind auth, but Server Actions remain public POST targets.
  await requireSession();
  const parsed = budgetSchema.safeParse({
    category: String(formData.get("category") ?? "")
      .trim()
      .toUpperCase(),
    monthlyLimit: formData.get("monthlyLimit"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a positive monthly amount.",
    };
  }

  const db = getDb();
  await db.execute(sql`
    insert into public.budgets (
      category_primary,
      monthly_limit,
      updated_at
    )
    values (
      ${parsed.data.category},
      ${parsed.data.monthlyLimit},
      now()
    )
    on conflict (category_primary) do update
    set
      monthly_limit = excluded.monthly_limit,
      updated_at = now()
  `);
  revalidatePath("/budgets");
  revalidatePath("/");
  return { status: "saved", message: "Budget saved." };
}
