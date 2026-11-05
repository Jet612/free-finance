import type { Metadata } from "next";
import { Check, CircleDashed, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";

import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WelcomeForm } from "@/components/welcome-form";
import { setupIssues } from "@/lib/app-config";
import { hasOwner } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Welcome",
};

export const dynamic = "force-dynamic";

const steps = [
  { title: "Deploy the app", done: true },
  { title: "Create your login", done: false },
  { title: "Connect your bank", done: false },
];

export default async function WelcomePage() {
  const issues = setupIssues();
  const databaseReady = !issues.some((issue) => issue.key === "database");
  if (databaseReady && (await hasOwner())) redirect("/login");

  // Plaid keys can be fixed later from Connections; these block creating a login.
  const blocking = issues.filter((issue) => issue.key !== "plaid");
  const appName = process.env.APP_NAME ?? "Free Finance";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute -left-40 -top-40 size-[34rem] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-40 size-[34rem] rounded-full bg-chart-2/10 blur-3xl" />
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl border bg-card shadow-2xl shadow-foreground/5 md:grid-cols-[0.95fr_1.05fr]">
        <section className="hidden border-r bg-sidebar p-10 md:flex md:flex-col md:justify-between">
          <Brand name={appName} />
          <div>
            <p className="max-w-sm text-balance text-3xl font-semibold leading-tight tracking-tight">
              You&apos;re almost there.
            </p>
            <ol className="mt-6 grid gap-3">
              {steps.map((step) => (
                <li key={step.title} className="flex items-center gap-3 text-sm">
                  {step.done ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  ) : (
                    <CircleDashed className="size-5 text-muted-foreground" />
                  )}
                  {step.title}
                </li>
              ))}
            </ol>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            This copy of the app is yours alone. Only one login can ever be
            created here.
          </p>
        </section>

        <Card className="border-0 bg-transparent p-2 shadow-none sm:p-6">
          <CardHeader className="pb-6">
            <div className="mb-7 md:hidden">
              <Brand name={appName} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {blocking.length ? "One more thing on Vercel" : "Create your login"}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              {blocking.length
                ? "A few settings are missing. Once they're filled in, this page will let you continue."
                : "This is the login you'll use to see your dashboard."}
            </p>
          </CardHeader>
          <CardContent>
            {blocking.length ? (
              <ul className="grid gap-4">
                {blocking.map((issue) => (
                  <li key={issue.key} className="flex gap-3">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="text-sm font-medium">{issue.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {issue.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <WelcomeForm />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
