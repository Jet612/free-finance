"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, LoaderCircle } from "lucide-react";

import { createOwnerAccount, type WelcomeState } from "@/app/welcome/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: WelcomeState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" />
          Setting up
        </>
      ) : (
        <>
          Create my login
          <ArrowRight className="ml-auto" />
        </>
      )}
    </Button>
  );
}

export function WelcomeForm() {
  const [state, action] = useActionState(createOwnerAccount, initialState);
  // React clears uncontrolled fields after an action, and one typo shouldn't
  // cost someone everything they entered.
  const [setupPassword, setSetupPassword] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="setupPassword">Setup password</Label>
        <Input
          id="setupPassword"
          name="setupPassword"
          type="password"
          autoComplete="off"
          required
          value={setupPassword}
          onChange={(event) => setSetupPassword(event.target.value)}
          aria-describedby="setup-password-help"
          className="h-11"
        />
        <p
          id="setup-password-help"
          className="text-xs leading-5 text-muted-foreground"
        >
          The CRON_SECRET you created when deploying on Vercel. This proves the
          app is yours.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Your email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Choose a password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby="password-help"
          className="h-11"
        />
        <p id="password-help" className="text-xs text-muted-foreground">
          At least 12 characters. You&apos;ll use this to sign in from now on.
        </p>
      </div>
      <SubmitButton />
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
