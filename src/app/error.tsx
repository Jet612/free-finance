"use client";

import { Seal } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <Seal className="mx-auto size-12 text-primary" />
        <h1 className="wide mt-5 text-[1.75rem] font-semibold tracking-[-0.02em]">
          This page didn&apos;t load
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-6 text-muted-foreground">
          Your data is safe. Try again in a moment. If this keeps happening, the
          connection to your database may need a look in your Vercel project.
        </p>
        <Button onClick={reset} size="lg" className="mt-5 h-10 px-4">
          Try again
        </Button>
      </div>
    </main>
  );
}
