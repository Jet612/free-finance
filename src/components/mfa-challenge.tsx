"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import type { Factor } from "@supabase/supabase-js";

import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function MfaChallenge() {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor<"totp", "verified">[]>([]);
  const [factorId, setFactorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (error || !data.totp.length) {
        setMessage(
          "No verified authenticator is available. Use Supabase to recover this account.",
        );
        setLoading(false);
        return;
      }
      setFactors(data.totp);
      setFactorId(data.totp[0].id);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(
      new FormData(event.currentTarget).get("code") ?? "",
    ).replace(/\s/g, "");
    if (!factorId || !/^\d{6}$/.test(code)) {
      setMessage("Enter the six-digit code from your authenticator app.");
      return;
    }

    setVerifying(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) {
      setMessage("That code could not be verified. Wait for a new code and retry.");
      setVerifying(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="text-sm leading-6 text-muted-foreground">
          This account opted into TOTP. Enter a current code to finish signing
          in.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <LoaderCircle className="mr-2 size-4 animate-spin" />
          Loading authenticators
        </div>
      ) : (
        <form onSubmit={verify} className="grid gap-4">
          {factors.length > 1 && (
            <div className="grid gap-2">
              <Label htmlFor="factor">Authenticator</Label>
              <select
                id="factor"
                value={factorId}
                onChange={(event) => setFactorId(event.target.value)}
                className="h-11 rounded-lg border bg-background px-3 text-sm"
              >
                {factors.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendly_name || "Authenticator app"}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="code">Six-digit code</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              autoFocus
              required
              className="h-12 text-center font-mono text-lg tracking-[0.35em]"
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={verifying || factors.length === 0}
          >
            {verifying && <LoaderCircle className="animate-spin" />}
            {verifying ? "Verifying" : "Verify and continue"}
          </Button>
        </form>
      )}

      {message && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {message}
        </p>
      )}

      <form action={logout}>
        <Button type="submit" variant="ghost" className="w-full">
          Cancel and sign out
        </Button>
      </form>
    </div>
  );
}
