import type { ReactNode } from "react";
import Link from "next/link";

import { Seal } from "@/components/brand";
import { cn } from "@/lib/utils";

/**
 * The headline states the answer, not the name of the page. Pages that lead with
 * a figure print it on the note, the same dark panel as net worth.
 */
export function PageHeader({
  title,
  detail,
  action,
  className,
  note = false,
}: {
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  className?: string;
  note?: boolean;
}) {
  const content = (
    <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="wide text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.125rem]">
          {title}
        </h1>
        {detail && (
          <p
            className={cn(
              "mt-1.5 max-w-[68ch] text-[0.9375rem] leading-6",
              note ? "text-note-muted" : "text-muted-foreground",
            )}
          >
            {detail}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );

  if (note) {
    return (
      <header
        className={cn(
          "relative mt-6 overflow-hidden rounded-2xl bg-note p-5 text-note-foreground sm:p-7",
          className,
        )}
      >
        <Seal
          rings={26}
          strokeWidth={0.6}
          className="pointer-events-none absolute -right-[17rem] -top-[17rem] size-[34rem] text-note-line/14"
        />
        {content}
      </header>
    );
  }
  return <header className={cn("pt-6", className)}>{content}</header>;
}

export function SectionHeading({
  title,
  detail,
  href,
  linkLabel,
}: {
  title: ReactNode;
  detail?: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <h2 className="semiwide text-[1.0625rem] font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        {detail && (
          <p className="mt-0.5 text-[0.8125rem] leading-5 text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center text-[0.8125rem] font-medium text-muted-foreground underline underline-offset-3 hover:text-foreground [@media(pointer:coarse)]:min-h-11"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

/** A raised sheet of paper for lists. Rows inside are separated by hairlines. */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-card ring-1 ring-border/70", className)}>
      {children}
    </div>
  );
}

export function EmptyNote({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-[0.9375rem] font-medium">{title}</p>
      {detail && (
        <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
          {detail}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
