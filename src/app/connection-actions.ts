"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { plaidItems } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { setupIssues } from "@/lib/app-config";
import {
  accessTokenFor,
  disconnectItem,
  LINK_COOKIE,
  requireConnectionConfig,
  type PendingLink,
} from "@/lib/connections";
import {
  createHostedLink,
  PlaidApiError,
  type LinkTarget,
} from "@/lib/plaid/client";

export type ConnectionActionState = {
  status: "idle" | "redirect" | "error";
  message?: string;
  url?: string;
};

const LINK_LIFETIME_SECONDS = 30 * 60;
const itemIdSchema = z.coerce.number().int().positive();
const kindSchema = z.enum(["bank", "investment"]);

async function completionUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host")?.split(",").at(0)?.trim() ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto")?.split(",").at(0)?.trim() ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}/connections/complete`;
}

/** Connecting needs settings only the owner can fix, so say which one. */
function connectionIssue(): ConnectionActionState | null {
  const issue = setupIssues().find(
    (item) => item.key === "plaid" || item.key === "secret",
  );
  return issue ? { status: "error", message: issue.detail } : null;
}

async function startHostedLink(
  target: LinkTarget,
  itemRowId?: number,
): Promise<ConnectionActionState> {
  const { config } = requireConnectionConfig();
  try {
    const { linkToken, url } = await createHostedLink(
      config,
      target,
      await completionUrl(),
      process.env.APP_NAME ?? "Free Finance",
    );
    const pending: PendingLink = { linkToken, itemRowId };
    const cookieStore = await cookies();
    // Lax, not strict: the browser returns here by following a link from Plaid.
    cookieStore.set(LINK_COOKIE, JSON.stringify(pending), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/connections",
      maxAge: LINK_LIFETIME_SECONDS,
    });
    return { status: "redirect", url };
  } catch (error) {
    const code = error instanceof PlaidApiError ? error.code : "UNKNOWN";
    console.error(`Could not start Plaid Link: ${code}`);
    return {
      status: "error",
      message:
        code === "INVALID_API_KEYS"
          ? "Plaid rejected your keys. Check PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV in your Vercel project."
          : "Plaid couldn't start just now. Please try again in a moment.",
    };
  }
}

export async function startConnection(
  _previousState: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
  void _previousState;
  // Server Actions are public POST endpoints, even when their form is private.
  await requireSession();
  const issue = connectionIssue();
  if (issue) return issue;

  const kind = kindSchema.safeParse(formData.get("kind"));
  if (!kind.success) {
    return { status: "error", message: "Choose what you'd like to connect." };
  }
  return startHostedLink({ mode: "new", kind: kind.data });
}

export async function reconnectConnection(
  _previousState: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
  void _previousState;
  await requireSession();
  const parsed = itemIdSchema.safeParse(formData.get("itemId"));
  if (!parsed.success) {
    return { status: "error", message: "That connection is no longer available." };
  }

  const [item] = await getDb()
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.id, parsed.data));
  if (!item) {
    return { status: "error", message: "That connection is no longer available." };
  }

  const issue = connectionIssue();
  if (issue) return issue;

  const { secret } = requireConnectionConfig();
  let accessToken: string;
  try {
    accessToken = accessTokenFor(item, secret);
  } catch {
    return {
      status: "error",
      message:
        "This connection can't be repaired because CRON_SECRET changed. Remove it and add it again.",
    };
  }
  return startHostedLink({ mode: "update", accessToken }, item.id);
}

export async function removeConnection(
  _previousState: ConnectionActionState,
  formData: FormData,
): Promise<ConnectionActionState> {
  void _previousState;
  await requireSession();
  const parsed = itemIdSchema.safeParse(formData.get("itemId"));
  if (!parsed.success) return { status: "idle" };

  const [item] = await getDb()
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.id, parsed.data));
  if (!item) return { status: "idle" };

  let revoked: boolean;
  try {
    revoked = await disconnectItem(item);
  } catch (error) {
    const code = error instanceof PlaidApiError ? error.code : "UNKNOWN";
    console.error(`Could not remove connection ${item.id}: ${code}`);
    return {
      status: "error",
      message:
        "Plaid couldn't remove this connection, so nothing was changed. Please try again.",
    };
  }
  revalidatePath("/", "layout");
  if (!revoked) redirect("/setup?connected=unrevoked");
  return { status: "idle" };
}
