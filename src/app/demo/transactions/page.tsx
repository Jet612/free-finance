import type { Metadata } from "next";

import { TransactionsView } from "@/components/dashboard-views/transactions-view";
import { getMockTransactionsData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Transactions demo" };

export default async function DemoTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <TransactionsView data={getMockTransactionsData()} searchParams={await searchParams} demo />
  );
}
