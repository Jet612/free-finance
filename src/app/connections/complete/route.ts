import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { requireSession } from "@/lib/auth";
import {
  clearItemError,
  LINK_COOKIE,
  parsePendingLink,
  saveNewConnections,
} from "@/lib/connections";
import { PlaidApiError } from "@/lib/plaid/client";
import { syncSingleItem } from "@/lib/sync/engine";

// The first import keeps running after the redirect, inside `after`.
export const maxDuration = 300;

/**
 * Plaid sends the browser here when Hosted Link finishes. Only the owner's
 * session can complete it, and only for the session this browser started, which
 * is what the HttpOnly cookie proves.
 */
export async function GET() {
  await requireSession();

  const cookieStore = await cookies();
  const pending = parsePendingLink(cookieStore.get(LINK_COOKIE)?.value);
  cookieStore.delete({ name: LINK_COOKIE, path: "/connections" });
  if (!pending) redirect("/setup");

  if (pending.itemRowId !== undefined) {
    const itemRowId = pending.itemRowId;
    await clearItemError(itemRowId);
    // If the sign-in didn't actually work, this records the problem again.
    after(() => syncSingleItem(itemRowId));
    redirect("/setup?connected=repaired");
  }

  let outcome: string;
  try {
    const { itemRowIds, duplicates } = await saveNewConnections(
      pending.linkToken,
    );
    after(async () => {
      for (const itemRowId of itemRowIds) await syncSingleItem(itemRowId);
    });
    outcome = itemRowIds.length
      ? "new"
      : duplicates
        ? "duplicate"
        : "cancelled";
  } catch (error) {
    const code = error instanceof PlaidApiError ? error.code : "UNKNOWN";
    console.error(`Could not save a Plaid connection: ${code}`);
    outcome = "failed";
  }
  redirect(`/setup?connected=${outcome}`);
}
