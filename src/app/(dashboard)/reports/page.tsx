import type { Metadata } from "next";

import { SpendingView } from "@/components/dashboard-views/spending-view";
import { SpendingMonthSelect } from "@/components/spending-month-select";
import { getSpendingData } from "@/lib/detail-data";

export const metadata: Metadata = { title: "Spending" };

export default async function SpendingPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const params = await searchParams;
  const requestedMonth = typeof params.month === "string" ? params.month : undefined;
  const data = await getSpendingData(requestedMonth);
  return <SpendingView data={data} monthPicker={<SpendingMonthSelect months={data.availableMonths} selectedMonth={data.selectedMonth} />} />;
}
