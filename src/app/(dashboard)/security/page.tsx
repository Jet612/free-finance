import { PageHeader } from "@/components/page-header";
import { SecuritySettings } from "@/components/security-settings";
import { requireSession } from "@/lib/auth";

export default async function SecurityPage() {
  const auth = await requireSession();

  return (
    <div className="grid gap-6">
      <PageHeader title="Security" />
      <SecuritySettings email={auth.user.email} />
    </div>
  );
}
