"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, LoaderCircle } from "lucide-react";

import { login, type LoginState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" />
          Signing in
        </>
      ) : (
        <>
          Open dashboard
          <ArrowRight />
        </>
      )}
    </Button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(login, initialState);

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="password">Dashboard password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-describedby={state.message ? "login-error" : undefined}
          className="h-11"
        />
      </div>
      {state.message && (
        <p
          id="login-error"
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.message}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
