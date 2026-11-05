"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth";

export type TransactionActionResult = {
  ok: boolean;
  message?: string;
  /** How many transactions changed. */
  changed?: number;
};

const idSchema = z.number().int().positive();
const categorySchema = z.string().regex(/^[A-Z_]{3,60}$/);

const FAILED: TransactionActionResult = {
  ok: false,
  message: "That change couldn't be saved. Try again.",
};

/** Files one transaction under a new category, and keeps it there through syncs. */
export async function recategorizeTransaction(
  id: number,
  category: string,
): Promise<TransactionActionResult> {
  // Server Actions are public POST endpoints, so authorize inside the action.
  await requireSession();
  const parsedId = idSchema.safeParse(id);
  const parsedCategory = categorySchema.safeParse(category);
  if (!parsedId.success || !parsedCategory.success) return FAILED;

  await getDb().execute(sql`
    update public.transactions
    set
      category_primary = ${parsedCategory.data},
      category_detailed = null,
      category_locked = true,
      updated_at = now()
    where id = ${parsedId.data}
      and pending = false
  `);
  revalidatePath("/", "layout");
  return { ok: true, changed: 1 };
}

/** Files every charge from a merchant under a category, now and from here on. */
export async function recategorizeMerchant(
  id: number,
  category: string,
): Promise<TransactionActionResult> {
  await requireSession();
  const parsedId = idSchema.safeParse(id);
  const parsedCategory = categorySchema.safeParse(category);
  if (!parsedId.success || !parsedCategory.success) return FAILED;

  const db = getDb();
  // The merchant comes from the row, never from what the browser sent.
  const [source] = await db.execute(sql`
    select coalesce(merchant_name, name) as merchant
    from public.transactions
    where id = ${parsedId.data}
  `);
  const merchant = (source as { merchant?: string } | undefined)?.merchant;
  if (!merchant) return FAILED;

  await db.execute(sql`
    insert into public.merchant_rules (merchant, category_primary, updated_at)
    values (${merchant}, ${parsedCategory.data}, now())
    on conflict (merchant) do update
    set category_primary = excluded.category_primary, updated_at = now()
  `);
  const updated = await db.execute(sql`
    update public.transactions
    set
      category_primary = ${parsedCategory.data},
      category_detailed = null,
      category_locked = true,
      updated_at = now()
    where coalesce(merchant_name, name) = ${merchant}
      and pending = false
    returning id
  `);
  revalidatePath("/", "layout");
  return { ok: true, changed: updated.length };
}

const previousSchema = z
  .array(
    z.object({
      id: idSchema,
      category: categorySchema.nullable(),
      detailed: z.string().max(120).nullable(),
    }),
  )
  .max(2000);

/** Takes back "use this for every charge", restoring each one as it was. */
export async function undoMerchantCategory(
  id: number,
  previous: { id: number; category: string | null; detailed: string | null }[],
): Promise<TransactionActionResult> {
  await requireSession();
  const parsedId = idSchema.safeParse(id);
  const parsedPrevious = previousSchema.safeParse(previous);
  if (!parsedId.success || !parsedPrevious.success) return FAILED;

  await getDb().transaction(async (tx) => {
    await tx.execute(sql`
      delete from public.merchant_rules
      where merchant = (
        select coalesce(merchant_name, name)
        from public.transactions
        where id = ${parsedId.data}
      )
    `);
    for (const item of parsedPrevious.data) {
      await tx.execute(sql`
        update public.transactions
        set
          category_primary = ${item.category},
          category_detailed = ${item.detailed},
          category_locked = false,
          updated_at = now()
        where id = ${item.id}
      `);
    }
  });
  revalidatePath("/", "layout");
  return { ok: true, changed: parsedPrevious.data.length };
}

/** Leaves a transaction out of income, spending, and budgets, or brings it back. */
export async function setTransactionIgnored(
  id: number,
  ignored: boolean,
): Promise<TransactionActionResult> {
  await requireSession();
  const parsedId = idSchema.safeParse(id);
  const parsedIgnored = z.boolean().safeParse(ignored);
  if (!parsedId.success || !parsedIgnored.success) return FAILED;

  await getDb().execute(sql`
    update public.transactions
    set ignored = ${parsedIgnored.data}, updated_at = now()
    where id = ${parsedId.data}
      and pending = false
  `);
  revalidatePath("/", "layout");
  return { ok: true, changed: 1 };
}
