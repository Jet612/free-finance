import { LogOut } from "lucide-react";

import { logout } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DashboardSignOut() {
  return (
    <form action={logout}>
      <Button
        type="submit"
        variant="ghost"
        className="w-full justify-start text-muted-foreground"
      >
        <LogOut />
        Sign out
      </Button>
    </form>
  );
}
