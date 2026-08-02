"use client";

import { type FormEvent, useState } from "react";
import {
  Fingerprint,
  KeyRound,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";

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

export function DemoSecuritySettings() {
  const [passkeys, setPasskeys] = useState(["MacBook Touch ID"]);
  const [authenticators, setAuthenticators] = useState(["1Password on iPhone"]);
  const [message, setMessage] = useState<string | null>(null);

  function addPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim() || "Personal passkey";
    setPasskeys((current) => [...current, name]);
    setMessage("Sample passkey added for this demo visit.");
    form.reset();
  }

  function addAuthenticator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim() || "Authenticator app";
    setAuthenticators((current) => [...current, name]);
    setMessage("Sample authenticator added for this demo visit.");
    form.reset();
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
        <Card size="sm"><CardHeader><CardDescription>Account</CardDescription><CardTitle className="truncate">demo@freefinance.app</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Passkeys</CardDescription><CardTitle>{passkeys.length ? `${passkeys.length} enrolled` : "Optional"}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Authenticator MFA</CardDescription><CardTitle className="flex items-center gap-2">{authenticators.length ? "Enabled" : "Optional"}<Badge variant={authenticators.length ? "default" : "secondary"}>{authenticators.length ? "AAL2" : "AAL1"}</Badge></CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Fingerprint className="size-5" /></div>
            <div><CardTitle>Passkeys</CardTitle><CardDescription>Phishing-resistant sign-in with Touch ID, Face ID, Windows Hello, or a hardware security key.</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          {passkeys.length > 0 && (
            <div className="divide-y rounded-xl border">
              {passkeys.map((passkey, index) => (
                <div key={`${passkey}-${index}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <KeyRound className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{passkey}</p><p className="text-xs text-muted-foreground">Added Jul 12, 2026 · Last used Aug 1, 2026</p></div>
                  <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setMessage("Passkey names are editable in the real app.")}>Rename</Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${passkey}`} onClick={() => { setPasskeys((current) => current.filter((_, itemIndex) => itemIndex !== index)); setMessage("Sample passkey removed for this demo visit."); }}><Trash2 /></Button></div>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={addPasskey} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-2"><Label htmlFor="demo-passkey-name">New passkey name</Label><Input id="demo-passkey-name" name="name" placeholder="MacBook Touch ID" maxLength={120} /></div>
            <Button type="submit"><Plus />Add passkey</Button>
          </form>
          <p className="text-xs leading-5 text-muted-foreground">Passkeys are optional and domain-bound. Add at least two before treating them as your primary recovery path. Supabase currently labels this API experimental.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary"><Smartphone className="size-5" /></div>
            <div><CardTitle>Authenticator app (TOTP)</CardTitle><CardDescription>Optional second-factor codes from 1Password, Authy, Google Authenticator, or another compatible app.</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          {authenticators.length > 0 && (
            <div className="divide-y rounded-xl border">
              {authenticators.map((authenticator, index) => (
                <div key={`${authenticator}-${index}`} className="flex items-center gap-3 p-4">
                  <ShieldCheck className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{authenticator}</p><p className="text-xs text-muted-foreground">Added Jul 12, 2026</p></div>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${authenticator}`} onClick={() => { setAuthenticators((current) => current.filter((_, itemIndex) => itemIndex !== index)); setMessage("Sample authenticator removed for this demo visit."); }}><Trash2 /></Button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={addAuthenticator} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-2"><Label htmlFor="demo-totp-name">Authenticator name</Label><Input id="demo-totp-name" name="name" placeholder="1Password on iPhone" maxLength={120} /></div>
            <Button type="submit" variant={authenticators.length ? "outline" : "default"}><Plus />Add authenticator</Button>
          </form>
          <Alert>
            <ShieldCheck />
            <AlertTitle>{authenticators.length ? "Second factor is enforced" : "Your choice, not a requirement"}</AlertTitle>
            <AlertDescription>{authenticators.length ? "Because you enrolled TOTP, every new password or passkey session must complete a current authenticator code." : "Leave this disabled for simpler sign-in. Enabling it adds a required code after password or passkey authentication."}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
