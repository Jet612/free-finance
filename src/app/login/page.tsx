import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthHeading, AuthLayout } from "@/components/auth-layout";
import { LoginForm } from "@/components/login-form";
import { Button } from "@/components/ui/button";
import { databaseUrl } from "@/lib/app-config";
import { hasOwner, hasSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  // A deployment nobody has claimed yet has nothing to sign in to.
  const supabaseReady = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  if (!supabaseReady || !databaseUrl() || !(await hasOwner())) {
    redirect("/welcome");
  }
  if (await hasSession()) redirect("/");
  const appName = process.env.APP_NAME ?? "Free Finance";

  return (
    <AuthLayout
      appName={appName}
      statement="Your money, kept private."
      aside="A private view of your cash, spending, and investments. Your bank password never touches this app."
    >
      <AuthHeading title="Welcome back" detail="Sign in to see where you stand." />
      <LoginForm />
      <div className="mt-8 border-t pt-5">
        <Button asChild variant="outline" size="lg" className="h-11 w-full">
          <Link href="/demo">Explore the interactive demo</Link>
        </Button>
        <p className="mt-3 text-center text-[0.8125rem] leading-5 text-muted-foreground">
          The demo uses sample data and never connects to a bank.
        </p>
      </div>
    </AuthLayout>
  );
}
