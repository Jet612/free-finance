import type { Metadata } from "next";

import { BudgetsView } from "@/components/dashboard-views/budgets-view";
import { getMockBudgetsData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Budgets demo" };

export default function DemoBudgetsPage() {
  return <BudgetsView data={getMockBudgetsData()} demo basePath="/demo" />;
}
