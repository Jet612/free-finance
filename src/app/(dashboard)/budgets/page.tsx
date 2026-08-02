import type { Metadata } from "next";

import { BudgetRowForm } from "@/components/budget-row-form";
import { BudgetsView } from "@/components/dashboard-views/budgets-view";
import { getBudgetsData } from "@/lib/detail-data";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  const data = await getBudgetsData();
  return <BudgetsView data={data} renderForm={(budget) => <BudgetRowForm category={budget.category} monthlyLimit={budget.monthlyLimit} />} />;
}
