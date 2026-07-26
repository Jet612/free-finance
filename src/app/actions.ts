"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SyncActionState = {
  status: "idle" | "queued" | "cooldown" | "error";
  message?: string;
  queuedAt?: string;
  runUrl?: string;
};

const SYNC_REQUEST_COOKIE = "free_finance_sync_requested_at";
const SYNC_COOLDOWN_MS = 10 * 60 * 1000;

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

  const token = process.env.GITHUB_SYNC_TOKEN?.trim();
  const repository = process.env.GITHUB_SYNC_REPOSITORY?.trim();
  if (!token || !repository) {
    return {
      status: "error",
      message:
        "Manual sync needs the server-only GitHub sync token configured.",
    };
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    return {
      status: "error",
      message: "GITHUB_SYNC_REPOSITORY must use the owner/repository format.",
    };
  }

  const db = getDb();
  const stateRows = await db.execute(sql`
    select
      max(last_attempt_at) as last_attempt_at,
      coalesce(bool_or(status = 'running'), false) as running
    from public.sync_states
    where source in ('plaid', 'robinhood')
  `);
  const state = stateRows[0] as
    | { last_attempt_at?: Date | string | null; running?: boolean }
    | undefined;
  if (state?.running) {
    return {
      status: "cooldown",
      message: "A provider sync is already running.",
    };
  }

  const now = Date.now();
  const lastAttempt = state?.last_attempt_at
    ? new Date(state.last_attempt_at).getTime()
    : 0;
  const cookieStore = await cookies();
  const lastRequest = Number(
    cookieStore.get(SYNC_REQUEST_COOKIE)?.value ?? 0,
  );
  const mostRecent = Math.max(
    Number.isFinite(lastAttempt) ? lastAttempt : 0,
    Number.isFinite(lastRequest) ? lastRequest : 0,
  );
  const remainingMs = SYNC_COOLDOWN_MS - (now - mostRecent);
  if (remainingMs > 0) {
    const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    return {
      status: "cooldown",
      message: `Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.github.com/repos/${repository}/actions/workflows/sync.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2026-03-10",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: { source: "all", dry_run: false },
        }),
        cache: "no-store",
      },
    );
  } catch {
    return {
      status: "error",
      message: "GitHub could not be reached. Try again in a moment.",
    };
  }

  if (!response.ok) {
    return {
      status: "error",
      message:
        response.status === 401 || response.status === 403
          ? "GitHub rejected the sync token. Check its Actions permission."
          : `GitHub could not queue the sync (HTTP ${response.status}).`,
    };
  }

  const result = (await response.json().catch(() => null)) as {
    html_url?: unknown;
  } | null;
  const fallbackUrl = `https://github.com/${repository}/actions/workflows/sync.yml`;
  const runUrl =
    typeof result?.html_url === "string" &&
    result.html_url.startsWith("https://github.com/")
      ? result.html_url
      : fallbackUrl;
  const queuedAt = new Date(now).toISOString();

  cookieStore.set(SYNC_REQUEST_COOKIE, String(now), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SYNC_COOLDOWN_MS / 1000,
    priority: "high",
  });
  revalidatePath("/");

  return {
    status: "queued",
    message: "Sync queued. This page will refresh automatically.",
    queuedAt,
    runUrl,
  };
}
