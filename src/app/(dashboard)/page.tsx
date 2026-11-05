import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ImportWatcher } from "@/components/connection-controls";
import { OverviewView } from "@/components/dashboard-views/overview-view";
import { SyncNowButton } from "@/components/sync-now-button";
import { getDashboardData } from "@/lib/data";
import { DISMISSED_COOKIE, parseDismissed } from "@/lib/dismissals";

export const metadata: Metadata = { title: "Today" };

// Refresh runs the sync inside its Server Action, which inherits this limit.
export const maxDuration = 300;

export default async function DashboardPage() {
  const [data, cookieStore] = await Promise.all([getDashboardData(), cookies()]);
  return (
    <>
      {data.health.importing && <ImportWatcher />}
      <OverviewView
        data={data}
        syncAction={<SyncNowButton />}
        dismissed={parseDismissed(cookieStore.get(DISMISSED_COOKIE)?.value)}
      />
    </>
  );
}
