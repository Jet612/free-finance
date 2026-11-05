import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardSignOut } from "@/components/dashboard-sign-out";
import { requireSession } from "@/lib/auth";
import { getStaleConnections } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Each data function verifies again; this check protects the shell itself.
  await requireSession();
  // A warning is never worth taking the whole shell down, Settings included.
  const staleConnections = await getStaleConnections().catch(() => []);
  return (
    <DashboardShell accountMenu={<DashboardSignOut />} staleConnections={staleConnections}>
      {children}
    </DashboardShell>
  );
}
