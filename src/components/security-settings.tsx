"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import Image from "next/image";
import {
  Fingerprint,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Trash2,
} from "lucide-react";
import type { Factor, PasskeyListItem } from "@supabase/supabase-js";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { usePasskeySupport } from "@/lib/use-passkey-support";

type TotpFactor = Factor<"totp", "verified">;
type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

function formatDate(value: string | undefined) {
  if (!value) return "Never used";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SecuritySettings({ email }: { email: string | null }) {
  const [passkeys, setPasskeys] = useState<PasskeyListItem[]>([]);
  const [totpFactors, setTotpFactors] = useState<TotpFactor[]>([]);
  const [currentLevel, setCurrentLevel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const passkeySupported = usePasskeySupport();

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [passkeyResult, factorResult, assuranceResult] = await Promise.all([
      supabase.auth.passkey.list(),
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);

    if (passkeyResult.error || factorResult.error || assuranceResult.error) {
      setMessage("Security settings could not be loaded. Refresh and try again.");
      setLoading(false);
      return;
    }
    setPasskeys(passkeyResult.data);
    setTotpFactors(factorResult.data.totp);
    setCurrentLevel(assuranceResult.data.currentLevel);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void Promise.all([
      supabase.auth.passkey.list(),
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]).then(([passkeyResult, factorResult, assuranceResult]) => {
      if (!active) return;
      if (passkeyResult.error || factorResult.error || assuranceResult.error) {
        setMessage(
          "Security settings could not be loaded. Refresh and try again.",
        );
        setLoading(false);
        return;
      }
      setPasskeys(passkeyResult.data);
      setTotpFactors(factorResult.data.totp);
      setCurrentLevel(assuranceResult.data.currentLevel);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  async function addPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name =
      String(new FormData(form).get("name") ?? "").trim() ||
      "Personal passkey";
    setPending("add-passkey");
    setMessage(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.registerPasskey();
    if (error || !data) {
      setMessage(
        "Passkey enrollment did not complete. Confirm this domain is allowed in Supabase and retry.",
      );
      setPending(null);
      return;
    }

    const rename = await supabase.auth.passkey.update({
      passkeyId: data.id,
      friendlyName: name.slice(0, 120),
    });
    setMessage(
      rename.error
        ? "The passkey was added, but its display name could not be saved."
        : "Passkey added. Password sign-in remains available.",
    );
    form.reset();
    await refresh();
    setPending(null);
  }

  async function renamePasskey(passkey: PasskeyListItem) {
    const nextName = window.prompt(
      "Name this passkey",
      passkey.friendly_name || "Personal passkey",
    )?.trim();
    if (!nextName) return;

    setPending(`rename-${passkey.id}`);
    setMessage(null);
    const { error } = await createClient().auth.passkey.update({
      passkeyId: passkey.id,
      friendlyName: nextName.slice(0, 120),
    });
    setMessage(error ? "The passkey could not be renamed." : "Passkey renamed.");
    await refresh();
    setPending(null);
  }

  async function deletePasskey(passkey: PasskeyListItem) {
    if (
      !window.confirm(
        `Remove “${passkey.friendly_name || "this passkey"}”? Password sign-in will still work.`,
      )
    ) {
      return;
    }

    setPending(`delete-${passkey.id}`);
    setMessage(null);
    const { error } = await createClient().auth.passkey.delete({
      passkeyId: passkey.id,
    });
    setMessage(error ? "The passkey could not be removed." : "Passkey removed.");
    await refresh();
    setPending(null);
  }

  async function beginTotpEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name =
      String(new FormData(form).get("name") ?? "").trim() ||
      "Authenticator app";
    setPending("enroll-totp");
    setMessage(null);

    const supabase = createClient();
    const existing = await supabase.auth.mfa.listFactors();
    if (existing.error) {
      setMessage("Authenticator enrollment could not start. Please retry.");
      setPending(null);
      return;
    }

    // Abandoned enrollment attempts are unverified and safe to clean up.
    const abandoned = existing.data.all.filter(
      (factor) =>
        factor.factor_type === "totp" && factor.status === "unverified",
    );
    for (const factor of abandoned) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: name.slice(0, 120),
      issuer: "Free Finance",
    });
    if (error) {
      setMessage("Authenticator enrollment could not start. Please retry.");
      setPending(null);
      return;
    }

    setEnrollment({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setShowSecret(false);
    form.reset();
    setPending(null);
  }

  async function verifyTotp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    const code = String(
      new FormData(event.currentTarget).get("code") ?? "",
    ).replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) {
      setMessage("Enter the six-digit code from your authenticator app.");
      return;
    }

    setPending("verify-totp");
    setMessage(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code,
    });
    if (error) {
      setMessage("That code could not be verified. Wait for a new code and retry.");
      setPending(null);
      return;
    }

    setEnrollment(null);
    setMessage(
      "Authenticator MFA is active. Future sign-ins will require a current code.",
    );
    await refresh();
    setPending(null);
  }

  async function cancelTotpEnrollment() {
    if (!enrollment) return;
    setPending("cancel-totp");
    await createClient().auth.mfa.unenroll({
      factorId: enrollment.factorId,
    });
    setEnrollment(null);
    setShowSecret(false);
    setMessage("Authenticator enrollment canceled.");
    setPending(null);
  }

  async function removeTotp(factor: TotpFactor) {
    if (
      !window.confirm(
        `Remove “${factor.friendly_name || "this authenticator"}”? Your account will return to password/passkey-only sign-in if this is the last one.`,
      )
    ) {
      return;
    }

    setPending(`remove-${factor.id}`);
    setMessage(null);
    const { error } = await createClient().auth.mfa.unenroll({
      factorId: factor.id,
    });
    setMessage(
      error
        ? "The authenticator could not be removed. Sign in with MFA again and retry."
        : "Authenticator removed.",
    );
    await refresh();
    setPending(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">
        <LoaderCircle className="mr-2 size-4 animate-spin" />
        Loading security settings
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {message && (
        <Alert>
          <ShieldCheck />
          <AlertTitle>Security update</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Account</CardDescription>
            <CardTitle className="truncate">{email || "Supabase user"}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Passkeys</CardDescription>
            <CardTitle>
              {passkeys.length ? `${passkeys.length} enrolled` : "Optional"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Authenticator MFA</CardDescription>
            <CardTitle className="flex items-center gap-2">
              {totpFactors.length ? "Enabled" : "Optional"}
              <Badge variant={totpFactors.length ? "default" : "secondary"}>
                {currentLevel === "aal2" ? "AAL2" : "AAL1"}
              </Badge>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Fingerprint className="size-5" />
            </div>
            <div>
              <CardTitle>Passkeys</CardTitle>
              <CardDescription>
                Phishing-resistant sign-in with Touch ID, Face ID, Windows
                Hello, or a hardware security key.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          {!passkeySupported && (
            <Alert>
              <ShieldOff />
              <AlertTitle>Passkeys unavailable in this browser</AlertTitle>
              <AlertDescription>
                Use a current browser over HTTPS, or continue using a password.
              </AlertDescription>
            </Alert>
          )}

          {passkeys.length > 0 && (
            <div className="divide-y rounded-xl border">
              {passkeys.map((passkey) => (
                <div
                  key={passkey.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <KeyRound className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {passkey.friendly_name || "Personal passkey"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added {formatDate(passkey.created_at)} · Last used{" "}
                      {formatDate(passkey.last_used_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => renamePasskey(passkey)}
                      disabled={pending !== null}
                    >
                      Rename
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${passkey.friendly_name || "passkey"}`}
                      onClick={() => deletePasskey(passkey)}
                      disabled={pending !== null}
                    >
                      {pending === `delete-${passkey.id}` ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={addPasskey}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="grid flex-1 gap-2">
              <Label htmlFor="passkey-name">New passkey name</Label>
              <Input
                id="passkey-name"
                name="name"
                placeholder="MacBook Touch ID"
                maxLength={120}
              />
            </div>
            <Button
              type="submit"
              disabled={!passkeySupported || pending !== null}
            >
              {pending === "add-passkey" ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Plus />
              )}
              Add passkey
            </Button>
          </form>

          <p className="text-xs leading-5 text-muted-foreground">
            Passkeys are optional and domain-bound. Add at least two before
            treating them as your primary recovery path. Supabase currently
            labels this API experimental.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Smartphone className="size-5" />
            </div>
            <div>
              <CardTitle>Authenticator app (TOTP)</CardTitle>
              <CardDescription>
                Optional second-factor codes from 1Password, Authy, Google
                Authenticator, or another compatible app.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          {totpFactors.length > 0 && (
            <div className="divide-y rounded-xl border">
              {totpFactors.map((factor) => (
                <div
                  key={factor.id}
                  className="flex items-center gap-3 p-4"
                >
                  <ShieldCheck className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {factor.friendly_name || "Authenticator app"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added {formatDate(factor.created_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${factor.friendly_name || "authenticator"}`}
                    onClick={() => removeTotp(factor)}
                    disabled={pending !== null}
                  >
                    {pending === `remove-${factor.id}` ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {enrollment ? (
            <div className="grid gap-5 rounded-xl border bg-muted/20 p-5 lg:grid-cols-[240px_1fr]">
              <div className="grid place-items-center rounded-xl bg-white p-4">
                {/* This data URI contains the temporary secret and never leaves the browser. */}
                <Image
                  src={enrollment.qrCode}
                  alt="Authenticator enrollment QR code"
                  width={208}
                  height={208}
                  unoptimized
                  className="aspect-square w-full max-w-52"
                />
              </div>
              <div className="grid content-start gap-4">
                <div>
                  <h3 className="font-medium">Scan, then verify</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Scan this once with your authenticator. Then enter its
                    current six-digit code. Do not save screenshots of this QR
                    code.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="totp-secret">Can&apos;t scan?</Label>
                  <div className="flex gap-2">
                    <Input
                      id="totp-secret"
                      readOnly
                      type={showSecret ? "text" : "password"}
                      value={enrollment.secret}
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowSecret((value) => !value)}
                    >
                      {showSecret ? "Hide" : "Show"}
                    </Button>
                  </div>
                </div>
                <form
                  onSubmit={verifyTotp}
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                >
                  <div className="grid flex-1 gap-2">
                    <Label htmlFor="totp-code">Six-digit code</Label>
                    <Input
                      id="totp-code"
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      className="font-mono tracking-[0.25em]"
                    />
                  </div>
                  <Button type="submit" disabled={pending !== null}>
                    {pending === "verify-totp" && (
                      <LoaderCircle className="animate-spin" />
                    )}
                    Verify and enable
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancelTotpEnrollment}
                    disabled={pending !== null}
                  >
                    Cancel
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <form
              onSubmit={beginTotpEnrollment}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="grid flex-1 gap-2">
                <Label htmlFor="totp-name">Authenticator name</Label>
                <Input
                  id="totp-name"
                  name="name"
                  placeholder="1Password on iPhone"
                  maxLength={120}
                />
              </div>
              <Button
                type="submit"
                variant={totpFactors.length ? "outline" : "default"}
                disabled={pending !== null}
              >
                {pending === "enroll-totp" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Plus />
                )}
                Add authenticator
              </Button>
            </form>
          )}

          <Alert>
            {totpFactors.length ? <ShieldCheck /> : <RefreshCw />}
            <AlertTitle>
              {totpFactors.length
                ? "Second factor is enforced"
                : "Your choice, not a requirement"}
            </AlertTitle>
            <AlertDescription>
              {totpFactors.length
                ? "Because you enrolled TOTP, every new password or passkey session must complete a current authenticator code."
                : "Leave this disabled for simpler sign-in. Enabling it adds a required code after password or passkey authentication."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
