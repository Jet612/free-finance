import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthHeading, AuthLayout } from "@/components/auth-layout";
import { MfaChallenge } from "@/components/mfa-challenge";
import { requirePrimarySession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Verify sign-in",
};

export default async function MfaPage() {
  const state = await requirePrimarySession();
  if (!state.needsMfa) redirect("/");
  const appName = process.env.APP_NAME ?? "Free Finance";

  return (
    <AuthLayout
      appName={appName}
      statement="One more step."
      aside="This keeps your finances yours, even if someone learns your password."
    >
      <AuthHeading
        title="Verify it's you"
        detail="Complete the security method you turned on for this account."
      />
      <MfaChallenge />
    </AuthLayout>
  );
}
