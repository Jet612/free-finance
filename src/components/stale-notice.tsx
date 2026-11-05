"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { usePathname } from "next/navigation";

import type { StaleConnection } from "@/lib/data";
import { staleSentence } from "@/lib/stale";

const SPENDING_PAGES = ["/reports", "/budgets", "/subscriptions", "/transactions"];

/** A total that's quietly too low is worse than none, so these pages say so. */
export function StaleNotice({
  connections,
  basePath,
}: {
  connections: StaleConnection[];
  basePath: string;
}) {
  const pathname = usePathname();
  const onSpendingPage = SPENDING_PAGES.some((page) => pathname === `${basePath}${page}`);
  if (!connections.length || !onSpendingPage) return null;

  return (
    <p role="status" className="mt-4 flex items-start gap-2 text-sm leading-6">
      <TriangleAlert className="mt-1 size-4 shrink-0 text-warning" aria-hidden="true" />
      <span>
        {staleSentence(connections)}{" "}
        <Link href={`${basePath}/setup`} className="font-medium underline underline-offset-3">
          Reconnect
        </Link>
      </span>
    </p>
  );
}
