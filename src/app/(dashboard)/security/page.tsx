import { SecuritySettings } from "@/components/security-settings";
import { requireSession } from "@/lib/auth";

export default async function SecurityPage() {
  const auth = await requireSession();

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
          Account protection
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Security
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Choose the protection that fits your instance. Password access stays
          available; passkeys and authenticator MFA are both optional.
        </p>
      </div>
      <SecuritySettings email={auth.user.email} />
    </div>
  );
}
