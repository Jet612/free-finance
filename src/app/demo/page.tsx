import { DemoSyncNowButton } from "@/components/demo-actions";
import { OverviewView } from "@/components/dashboard-views/overview-view";
import { mockDashboardData } from "@/lib/demo-data";

export default function DemoPage() {
  return <OverviewView data={mockDashboardData} syncAction={<DemoSyncNowButton />} basePath="/demo" />;
}
