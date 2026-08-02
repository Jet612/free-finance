import type { Metadata } from "next";

import { OverviewView } from "@/components/dashboard-views/overview-view";
import { SyncNowButton } from "@/components/sync-now-button";
import { getDashboardData } from "@/lib/data";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage() {
  const data = await getDashboardData();
  return (
    <OverviewView
      data={data}
      syncAction={
        <SyncNowButton
          configured={Boolean(process.env.GITHUB_SYNC_TOKEN && process.env.GITHUB_SYNC_REPOSITORY)}
          completedSyncAt={data.completedSyncAt}
          failedSyncAt={data.failedSyncAt}
        />
      }
    />
  );
}
