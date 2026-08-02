import type { Metadata } from "next";

import { DemoBudgetRowForm } from "@/components/demo-actions";
import { BudgetsView } from "@/components/dashboard-views/budgets-view";
import { mockBudgetsData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Budgets demo" };

export default function DemoBudgetsPage() {
  return <BudgetsView data={mockBudgetsData} renderForm={(budget) => <DemoBudgetRowForm category={budget.category} monthlyLimit={budget.monthlyLimit} />} />;
}
