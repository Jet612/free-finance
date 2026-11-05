import type { Metadata } from "next";

import { OverviewView } from "@/components/dashboard-views/overview-view";
import { SyncNowButton } from "@/components/sync-now-button";
import { getDashboardData } from "@/lib/data";

export const metadata: Metadata = { title: "Overview" };

// Refresh runs the sync inside its Server Action, which inherits this limit.
export const maxDuration = 300;

export default async function DashboardPage() {
  const data = await getDashboardData();
  return (
    <OverviewView
      data={data}
      syncAction={<SyncNowButton />}
    />
  );
}
