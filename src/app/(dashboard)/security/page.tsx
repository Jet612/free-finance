import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { SecuritySettings } from "@/components/security-settings";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const auth = await requireSession();

  return (
    <div className="grid gap-6">
      <PageHeader title="Security" detail="Add a second step to your sign-in." />
      <SecuritySettings email={auth.user.email} />
    </div>
  );
}
