import type { Metadata } from "next";

import { InvestmentsView } from "@/components/dashboard-views/investments-view";
import { mockInvestmentsData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Investments demo" };

export default function DemoInvestmentsPage() {
  return <InvestmentsView data={mockInvestmentsData} />;
}
