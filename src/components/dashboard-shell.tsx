import Link from "next/link";

import { Brand } from "@/components/brand";
import { CommandMenu } from "@/components/command-menu";
import { BottomNav, SectionTabs, TopNav } from "@/components/nav-links";
import { PrivacyToggle } from "@/components/privacy-toggle";
import { StaleNotice } from "@/components/stale-notice";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import type { StaleConnection } from "@/lib/data";

export function DashboardShell({
  children,
  demo = false,
  accountMenu,
  staleConnections = [],
}: {
  children: React.ReactNode;
  demo?: boolean;
  accountMenu?: React.ReactNode;
  staleConnections?: StaleConnection[];
}) {
  const appName = process.env.APP_NAME ?? "Free Finance";
  const basePath = demo ? "/demo" : "";

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {demo && (
        <div role="region" aria-label="Demo notice" className="bg-note text-note-foreground">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-4 py-1.5 text-[0.8125rem] sm:px-6 lg:px-8">
            <p>You&apos;re looking at sample data. None of it is real.</p>
            <Link
              href="/login"
              className="shrink-0 font-medium underline underline-offset-3"
            >
              Exit demo
            </Link>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            href={basePath || "/"}
            aria-label={`${appName} home`}
            className="rounded-md"
          >
            <Brand name={appName} />
          </Link>
          <TopNav basePath={basePath} />
          <div className="ml-auto flex items-center gap-0.5">
            <CommandMenu basePath={basePath} canSignOut={!demo} />
            <PrivacyToggle />
            <ThemeToggle />
            {accountMenu}
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-16 lg:pt-7"
      >
        <SectionTabs basePath={basePath} />
        <StaleNotice connections={staleConnections} basePath={basePath} />
        {children}
      </main>

      <BottomNav basePath={basePath} />
    </div>
  );
}

export function SignOutButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
        Sign out
      </Button>
    </form>
  );
}
