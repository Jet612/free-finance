import Link from "next/link";

import { Seal } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <Seal className="mx-auto size-12 text-primary" />
        <h1 className="wide mt-5 text-[1.75rem] font-semibold tracking-[-0.02em]">
          That page doesn&apos;t exist
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-6 text-muted-foreground">
          The link may be old, or the address may have a typo.
        </p>
        <Button asChild size="lg" className="mt-5 h-10 px-4">
          <Link href="/">Go to Today</Link>
        </Button>
      </div>
    </main>
  );
}
