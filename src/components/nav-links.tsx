"use client";

import {
  ArrowLeftRight,
  ChartPie,
  Landmark,
  type LucideIcon,
  Settings2,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type Page = { href: string; label: string };
type Section = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Pages grouped under this section, shown as tabs. */
  pages?: Page[];
};

/** Five destinations, so the whole app fits a phone's tab bar. */
export const SECTIONS: Section[] = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  {
    href: "/reports",
    label: "Spending",
    icon: ChartPie,
    pages: [
      { href: "/reports", label: "Breakdown" },
      { href: "/budgets", label: "Budgets" },
      { href: "/subscriptions", label: "Bills & subscriptions" },
    ],
  },
  {
    href: "/accounts",
    label: "Net worth",
    icon: Landmark,
    pages: [
      { href: "/accounts", label: "Accounts" },
      { href: "/investments", label: "Investments" },
    ],
  },
  {
    href: "/setup",
    label: "Settings",
    icon: Settings2,
    pages: [
      { href: "/setup", label: "Connections" },
      { href: "/security", label: "Security" },
    ],
  },
];

function withBase(basePath: string, href: string): string {
  return `${basePath}${href === "/" ? "" : href}` || "/";
}

function isActive(pathname: string, basePath: string, href: string): boolean {
  const target = withBase(basePath, href);
  if (href === "/") return pathname === target;
  return pathname === target || pathname.startsWith(`${target}/`);
}

function activeSection(pathname: string, basePath: string): Section | undefined {
  return SECTIONS.find((section) =>
    (section.pages ?? [section]).some((page) =>
      isActive(pathname, basePath, page.href),
    ),
  );
}

export function TopNav({ basePath = "" }: { basePath?: string }) {
  const pathname = usePathname();
  const current = activeSection(pathname, basePath);

  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {SECTIONS.map((section) => {
        const active = section === current;
        return (
          <Link
            key={section.href}
            href={withBase(basePath, section.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-primary text-primary-foreground hover:text-primary-foreground",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SectionTabs({ basePath = "" }: { basePath?: string }) {
  const pathname = usePathname();
  const pages = activeSection(pathname, basePath)?.pages;
  if (!pages) return null;

  return (
    <nav
      aria-label="In this section"
      className="scrollbar-none -mx-4 flex gap-6 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0"
    >
      {pages.map((page) => {
        const active = isActive(pathname, basePath, page.href);
        return (
          <Link
            key={page.href}
            href={withBase(basePath, page.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 border-transparent py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "border-primary text-foreground",
            )}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ basePath = "" }: { basePath?: string }) {
  const pathname = usePathname();
  const current = activeSection(pathname, basePath);

  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-card lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {SECTIONS.map((section) => {
          const active = section === current;
          return (
            <Link
              key={section.href}
              href={withBase(basePath, section.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground [font-stretch:85%]",
                active && "text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-11 items-center justify-center rounded-full transition-colors",
                  active && "bg-primary text-primary-foreground",
                )}
              >
                <section.icon className="size-[18px]" strokeWidth={1.9} />
              </span>
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
