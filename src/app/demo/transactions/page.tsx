import type { Metadata } from "next";

import { TransactionsView } from "@/components/dashboard-views/transactions-view";
import { mockTransactionsData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Transactions demo" };

export default function DemoTransactionsPage() {
  return <TransactionsView data={mockTransactionsData} />;
}
