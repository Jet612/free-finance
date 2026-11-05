"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { appOwner } from "@/db/schema";
import { appSecret, supabaseAdminKey } from "@/lib/app-config";
import { hasOwner } from "@/lib/auth";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { secretsMatch } from "@/lib/token-crypto";

export type WelcomeState = {
  status: "idle" | "error";
  message?: string;
};

const MIN_PASSWORD_LENGTH = 12;

const formSchema = z.object({
  setupPassword: z.string().min(1).max(1000),
  email: z.email().max(254),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(72),
});

/**
 * Claims this deployment for the person holding its setup password. The check
 * order matters: a claimed app refuses everything, and an unclaimed one reveals
 * nothing until the setup password is proven.
 */
export async function createOwnerAccount(
  _previousState: WelcomeState,
  formData: FormData,
): Promise<WelcomeState> {
  void _previousState;
  if (await hasOwner()) redirect("/login");

  const setupPassword = String(formData.get("setupPassword") ?? "").trim();
  if (!secretsMatch(setupPassword, appSecret())) {
    return {
      status: "error",
      message:
        "That setup password doesn't match the one you entered on Vercel.",
    };
  }

  const parsed = formSchema.safeParse({
    setupPassword,
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: `Enter a valid email and a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const adminKey = supabaseAdminKey();
  if (!adminKey) {
    return { status: "error", message: "Supabase isn't connected yet." };
  }
  const admin = createSupabaseClient(getSupabasePublicEnv().url, adminKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { email, password } = parsed.data;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    return {
      status: "error",
      message:
        error?.code === "email_exists"
          ? "That email already has a login here. Please use a different one."
          : error?.code === "weak_password"
            ? "Please choose a stronger password."
            : "Your login couldn't be created. Please try again.",
    };
  }

  // The primary key allows one row ever, so two racing claims can't both win.
  const claimed = await getDb()
    .insert(appOwner)
    .values({ userId: data.user.id })
    .onConflictDoNothing()
    .returning({ userId: appOwner.userId });
  if (!claimed.length) {
    await admin.auth.admin.deleteUser(data.user.id);
    redirect("/login");
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  redirect(signInError ? "/login" : "/setup");
}
