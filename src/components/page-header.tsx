import type { ReactNode } from "react";

export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex min-h-9 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-lg font-semibold tracking-[-0.02em]">{title}</h1>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
