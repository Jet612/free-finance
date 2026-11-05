import { cookies } from "next/headers";

import { DemoSyncNowButton } from "@/components/demo-actions";
import { OverviewView } from "@/components/dashboard-views/overview-view";
import { getMockDashboardData } from "@/lib/demo-data";
import { DISMISSED_COOKIE, parseDismissed } from "@/lib/dismissals";

export default async function DemoPage() {
  const cookieStore = await cookies();
  return (
    <OverviewView
      data={getMockDashboardData()}
      syncAction={<DemoSyncNowButton />}
      basePath="/demo"
      dismissed={parseDismissed(cookieStore.get(DISMISSED_COOKIE)?.value)}
    />
  );
}
