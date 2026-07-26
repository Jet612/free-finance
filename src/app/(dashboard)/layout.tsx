import { DashboardShell } from "@/components/dashboard-shell";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Each data function verifies again; this check protects the shell itself.
  await requireSession();
  return <DashboardShell>{children}</DashboardShell>;
}
