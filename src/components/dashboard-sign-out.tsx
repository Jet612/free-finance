import { logout } from "@/app/actions";
import { SignOutButton } from "@/components/dashboard-shell";

export function DashboardSignOut() {
  return <SignOutButton action={logout} />;
}
