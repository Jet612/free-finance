"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  ChartNoAxesCombined,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Repeat2,
  Settings2,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const groups = [
  {
    label: "Money",
    links: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/reports", label: "Spending", icon: ChartNoAxesCombined },
      { href: "/investments", label: "Investments", icon: TrendingUp },
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/subscriptions", label: "Subscriptions", icon: Repeat2 },
      { href: "/budgets", label: "Budgets", icon: PiggyBank },
      { href: "/accounts", label: "Accounts", icon: Landmark },
    ],
  },
  {
    label: "Manage",
    links: [
      { href: "/setup", label: "Connections", icon: Settings2 },
      { href: "/security", label: "Security", icon: ShieldCheck },
    ],
  },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="grid gap-6" aria-label="Primary navigation">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
            {group.label}
          </p>
          <div className="grid gap-1">
            {group.links.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground",
                    active &&
                      "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  <link.icon className="size-[17px]" strokeWidth={1.8} />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
