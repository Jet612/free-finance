"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createSession,
  deleteSession,
  passwordMatches,
} from "@/lib/auth";

export type LoginState = {
  message?: string;
};

const LoginSchema = z.object({
  password: z.string().min(1),
});

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { message: "Enter your dashboard password." };
  }

  try {
    if (!(await passwordMatches(parsed.data.password))) {
      return { message: "That password is not correct." };
    }
    await createSession();
  } catch {
    return {
      message:
        "Dashboard authentication is not configured. Check the server environment.",
    };
  }

  redirect("/");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
