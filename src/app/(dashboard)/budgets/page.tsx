import type { Metadata } from "next";

import { BudgetsView } from "@/components/dashboard-views/budgets-view";
import { getBudgetsData } from "@/lib/detail-data";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  return <BudgetsView data={await getBudgetsData()} />;
}
