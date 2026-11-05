"use client";

import { TriangleAlert } from "lucide-react";

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
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-5" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your dashboard couldn&apos;t load. Please try again in a moment. If
          this keeps happening, check that Supabase is connected in your Vercel
          project.
        </p>
        <Button onClick={reset} className="mt-5">
          Try again
        </Button>
      </div>
    </main>
  );
}
