import type { Metadata } from "next";
import { Check, CircleDashed, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthHeading, AuthLayout } from "@/components/auth-layout";
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
    <AuthLayout
      appName={appName}
      statement="You're almost there."
      aside={
        <>
          <ol className="grid gap-3">
            {steps.map((step) => (
              <li key={step.title} className="flex items-center gap-3 text-note-foreground">
                {step.done ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-note-foreground text-note">
                    <Check className="size-3" strokeWidth={3} aria-label="Done" />
                  </span>
                ) : (
                  <CircleDashed className="size-5 text-note-muted" aria-hidden="true" />
                )}
                {step.title}
              </li>
            ))}
          </ol>
          <p className="mt-6">
            This copy of the app is yours alone. Only one login can ever be created here.
          </p>
        </>
      }
    >
      <AuthHeading
        title={blocking.length ? "One more thing on Vercel" : "Create your login"}
        detail={
          blocking.length
            ? "A few settings are missing. Once they're filled in, this page will let you continue."
            : "This is the login you'll use to see your dashboard."
        }
      />
      {blocking.length ? (
        <ul className="grid gap-4">
          {blocking.map((issue) => (
            <li key={issue.key} className="flex gap-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">{issue.title}</p>
                <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">{issue.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <WelcomeForm />
      )}
    </AuthLayout>
  );
}
