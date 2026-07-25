import "server-only";

import { cache } from "react";
import {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "free_finance_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function requiredSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function sign(payload: string): string {
  return createHmac("sha256", requiredSecret())
    .update(payload)
    .digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

function createToken(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  // A nonce makes simultaneous sessions distinct without storing server state.
  const payload = `v1.${expiresAt}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const payload = parts.slice(0, 3).join(".");
  const signature = parts[3];
  const expiresAt = Number(parts[1]);
  return (
    Number.isFinite(expiresAt) &&
    expiresAt > Math.floor(Date.now() / 1000) &&
    safeEqual(signature, sign(payload))
  );
}

export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected || expected.length < 12) {
    throw new Error("DASHBOARD_PASSWORD must contain at least 12 characters.");
  }
  return safeEqual(candidate, expected);
}

export async function createSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_SECONDS,
    priority: "high",
  });
}

export async function deleteSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export const hasSession = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return verifyToken(token);
});

export const requireSession = cache(async (): Promise<void> => {
  if (!(await hasSession())) {
    redirect("/login");
  }
});
