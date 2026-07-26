import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { MfaChallenge } from "@/components/mfa-challenge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requirePrimarySession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Verify sign-in",
};

export default async function MfaPage() {
  const state = await requirePrimarySession();
  if (!state.needsMfa) redirect("/");
  const appName = process.env.APP_NAME ?? "Free Finance";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md shadow-xl shadow-foreground/5">
        <CardHeader className="gap-5">
          <Brand name={appName} />
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Verify it&apos;s you
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Complete the security method you enabled for this account.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <MfaChallenge />
        </CardContent>
      </Card>
    </main>
  );
}
