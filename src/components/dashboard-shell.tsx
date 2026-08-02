import Link from "next/link";
import { ArrowLeft, Database, LockKeyhole } from "lucide-react";

import { Brand } from "@/components/brand";
import { MobileNavigation } from "@/components/mobile-navigation";
import { NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function DashboardShell({
  children,
  demo = false,
  privateFooter,
}: {
  children: React.ReactNode;
  demo?: boolean;
  privateFooter?: React.ReactNode;
}) {
  const appName = process.env.APP_NAME ?? "Free Finance";
  const basePath = demo ? "/demo" : "";

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r bg-sidebar lg:flex lg:flex-col">
        <div className="flex h-[88px] items-center px-5">
          <Brand name={appName} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <NavLinks basePath={basePath} />
        </div>
        <div className="border-t p-3">
          <div className="mb-2 flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
            {demo ? (
              <Database className="size-3.5 text-primary" />
            ) : (
              <LockKeyhole className="size-3.5 text-primary" />
            )}
            {demo ? "Sample data · not saved" : "Private · server-only data"}
          </div>
          {demo ? (
            <Button
              asChild
              variant="ghost"
              className="w-full justify-start text-muted-foreground"
            >
              <Link href="/login">
                <ArrowLeft />
                Exit demo
              </Link>
            </Button>
          ) : privateFooter}
        </div>
      </aside>

      <div className="lg:pl-[232px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/88 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <MobileNavigation name={appName} basePath={basePath} />
            <div className="lg:hidden">
              <Brand compact />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-2 hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {demo ? "Demo instance" : "Personal instance"}
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
