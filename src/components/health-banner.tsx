import { Clock, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { DataHealth } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

/** Says plainly when the numbers on the page can't be trusted to be current. */
export function HealthBanner({
  health,
  connectionsHref,
}: {
  health: DataHealth;
  connectionsHref: string;
}) {
  if (health.attention.length) {
    const reconnect = health.attention.some((item) => item.needsReconnect);
    return (
      <Alert className="border-amber-500/40 bg-amber-500/5">
        <TriangleAlert className="text-amber-600 dark:text-amber-400" />
        <AlertTitle>
          {health.attention.length === 1
            ? `${health.attention[0].institution} needs a look`
            : `${health.attention.length} connections need a look`}
        </AlertTitle>
        <AlertDescription>
          <p>
            {health.attention.length === 1
              ? health.attention[0].message
              : "Some of your numbers may be out of date."}{" "}
            <Link
              href={connectionsHref}
              className="font-medium text-foreground underline underline-offset-3"
            >
              {reconnect ? "Reconnect now" : "See details"}
            </Link>
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  if (health.stale) {
    return (
      <Alert className="border-amber-500/40 bg-amber-500/5">
        <Clock className="text-amber-600 dark:text-amber-400" />
        <AlertTitle>Your numbers may be out of date</AlertTitle>
        <AlertDescription>
          <p>
            The last update was {formatDateTime(health.lastUpdatedAt)}. Updates
            normally run every morning.{" "}
            <Link
              href={connectionsHref}
              className="font-medium text-foreground underline underline-offset-3"
            >
              Check your connections
            </Link>
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
