import { LockKeyhole, LogOut } from "lucide-react";

import { logout } from "@/app/actions";
import { Brand } from "@/components/brand";
import { MobileNavigation } from "@/components/mobile-navigation";
import { NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const appName = process.env.APP_NAME ?? "Free Finance";

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar lg:flex lg:flex-col">
        <div className="flex h-20 items-center border-b px-6">
          <Brand name={appName} />
        </div>
        <div className="flex-1 px-3 py-6">
          <NavLinks />
        </div>
        <div className="border-t p-4">
          <div className="mb-3 flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <LockKeyhole className="size-3.5 text-primary" />
            Server-only financial data
          </div>
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
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/88 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <MobileNavigation name={appName} />
            <div className="lg:hidden">
              <Brand compact />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-2 hidden text-xs text-muted-foreground sm:inline">
              Personal instance
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
