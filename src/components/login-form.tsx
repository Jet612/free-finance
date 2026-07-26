"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Fingerprint,
  KeyRound,
  LoaderCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { usePasskeySupport } from "@/lib/use-passkey-support";

type PendingMethod = "password" | "passkey" | null;

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingMethod>(null);
  const [message, setMessage] = useState<string | null>(null);
  const passkeySupported = usePasskeySupport();

  async function finishSignIn() {
    const supabase = createClient();
    const { data, error } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;

    router.replace(
      data.nextLevel === "aal2" && data.currentLevel !== "aal2"
        ? "/mfa"
        : "/",
    );
    router.refresh();
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) return;

    setPending("password");
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setMessage("Sign-in failed. Check the email and password, then try again.");
      setPending(null);
      return;
    }

    try {
      await finishSignIn();
    } catch {
      setMessage("The session could not be verified. Please try again.");
      setPending(null);
    }
  }

  async function signInWithPasskey() {
    setPending("passkey");
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPasskey();
    if (error) {
      setMessage(
        "Passkey sign-in did not complete. You can retry or use your password.",
      );
      setPending(null);
      return;
    }

    try {
      await finishSignIn();
    } catch {
      setMessage("The session could not be verified. Please try again.");
      setPending(null);
    }
  }

  return (
    <div className="grid gap-5">
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={signInWithPasskey}
        disabled={!passkeySupported || pending !== null}
      >
        {pending === "passkey" ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <Fingerprint />
        )}
        {pending === "passkey" ? "Waiting for passkey" : "Use a passkey"}
      </Button>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or use password
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={signInWithPassword} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-describedby={message ? "login-error" : undefined}
            className="h-11"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full"
          disabled={pending !== null}
        >
          {pending === "password" ? (
            <>
              <LoaderCircle className="animate-spin" />
              Signing in
            </>
          ) : (
            <>
              <KeyRound />
              Sign in with password
              <ArrowRight className="ml-auto" />
            </>
          )}
        </Button>
      </form>

      {message && (
        <p
          id="login-error"
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {message}
        </p>
      )}

      {!passkeySupported && (
        <p className="text-center text-xs leading-5 text-muted-foreground">
          This browser does not expose passkeys. Password sign-in remains
          available.
        </p>
      )}
    </div>
  );
}
