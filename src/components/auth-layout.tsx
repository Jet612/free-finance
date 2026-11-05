import type { ReactNode } from "react";

import { Brand, Seal } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

/** The sign-in screens: the printed note on one side, the form on the other. */
export function AuthLayout({
  appName,
  statement,
  aside,
  children,
}: {
  appName: string;
  statement: ReactNode;
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-note p-12 text-note-foreground lg:flex lg:flex-col lg:justify-between">
        <Seal
          rings={40}
          strokeWidth={0.5}
          className="pointer-events-none absolute -right-64 -top-64 size-[46rem] text-note-line/25"
        />
        <Brand name={appName} onNote />
        <div className="relative max-w-md">
          <p className="wide text-[2.75rem] font-semibold leading-[1.08] tracking-[-0.025em] text-balance">
            {statement}
          </p>
          <div className="mt-5 text-[0.9375rem] leading-6 text-note-muted">{aside}</div>
        </div>
      </section>

      <section className="relative flex items-center justify-center px-4 py-14">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Brand name={appName} />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

export function AuthHeading({ title, detail }: { title: string; detail: ReactNode }) {
  return (
    <header className="mb-7">
      <h1 className="wide text-[1.875rem] font-semibold leading-tight tracking-[-0.02em]">
        {title}
      </h1>
      <p className="mt-2 text-[0.9375rem] leading-6 text-muted-foreground">{detail}</p>
    </header>
  );
}
