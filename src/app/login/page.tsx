import type { Metadata } from "next";
import { Database, Fingerprint, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { hasSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  if (await hasSession()) redirect("/");
  const appName = process.env.APP_NAME ?? "Free Finance";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute -left-40 -top-40 size-[34rem] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-40 size-[34rem] rounded-full bg-chart-2/10 blur-3xl" />
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl border bg-card shadow-2xl shadow-foreground/5 md:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden border-r bg-sidebar p-10 md:flex md:flex-col md:justify-between">
          <Brand name={appName} />
          <div>
            <p className="max-w-sm text-balance text-3xl font-semibold leading-tight tracking-tight">
              Your money, in your database.
            </p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              A single-tenant view of cash, spending, and investments. Provider
              credentials never reach the browser.
            </p>
          </div>
          <div className="grid gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Fingerprint className="size-4 text-primary" />
              Optional passkey and authenticator MFA
            </div>
            <div className="flex items-center gap-2">
              <Database className="size-4 text-primary" />
              Supabase PostgreSQL under your control
            </div>
          </div>
        </section>

        <Card className="border-0 bg-transparent p-2 shadow-none sm:p-6">
          <CardHeader className="pb-8">
            <div className="mb-7 md:hidden">
              <Brand name={appName} />
            </div>
            <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LockKeyhole className="size-[18px]" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome back
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Sign in to this private finance instance.
            </p>
          </CardHeader>
          <CardContent>
            <LoginForm />
            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              Curious?
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button asChild variant="secondary" size="lg" className="w-full">
              <Link href="/demo">
                Explore the interactive demo
              </Link>
            </Button>
            <p className="mt-5 text-center text-[11px] leading-5 text-muted-foreground">
              The demo uses sample data and never connects to a bank.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
