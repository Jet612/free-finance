"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Popover } from "radix-ui";

import { Money } from "@/components/money";

export type VitalLine = { label: string; value: number; subtract?: boolean };

/** A headline number that can always show how it was worked out. */
export function Vital({
  label,
  value,
  detail,
  lines,
  result,
  note,
  href,
  linkLabel,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  lines?: VitalLine[];
  result?: ReactNode;
  note?: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div>
      <Popover.Root>
        <Popover.Trigger className="group block w-full rounded-md text-left outline-offset-4">
          <span className="block text-[0.8125rem] text-muted-foreground">{label}</span>
          <span className="semiwide mt-0.5 block text-[1.375rem] font-semibold tracking-[-0.015em] underline decoration-muted-foreground decoration-dotted underline-offset-4 group-hover:decoration-foreground">
            {value}
          </span>
          <span className="mt-0.5 block text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
            {detail}
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className="z-40 w-72 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg data-open:animate-in data-open:fade-in-0"
          >
            <p className="text-[0.9375rem] font-semibold">{label}</p>
            {lines && (
              <dl className="mt-2 grid gap-1 text-sm">
                {lines.map((line) => (
                  <div key={line.label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{line.label}</dt>
                    <dd className="tnum">
                      {line.subtract && "− "}
                      <Money value={line.value} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {result && (
              <p className="mt-2 flex justify-between gap-3 border-t pt-2 text-sm font-semibold">
                {result}
              </p>
            )}
            {note && <p className="mt-2 text-[0.8125rem] leading-5 text-muted-foreground">{note}</p>}
            <Link
              href={href}
              className="mt-2.5 inline-flex items-center gap-0.5 text-[0.8125rem] font-medium underline underline-offset-3"
            >
              {linkLabel}
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
