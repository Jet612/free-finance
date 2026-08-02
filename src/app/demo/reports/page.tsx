import type { Metadata } from "next";

import { SpendingView } from "@/components/dashboard-views/spending-view";
import { SpendingMonthSelect } from "@/components/spending-month-select";
import { getMockSpendingData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Spending demo" };

export default async function DemoSpendingPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const params = await searchParams;
  const requestedMonth = typeof params.month === "string" ? params.month : undefined;
  const data = getMockSpendingData(requestedMonth);
  return <SpendingView data={data} monthPicker={<SpendingMonthSelect months={data.availableMonths} selectedMonth={data.selectedMonth} basePath="/demo/reports" />} />;
}
