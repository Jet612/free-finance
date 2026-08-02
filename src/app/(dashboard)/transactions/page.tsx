import type { Metadata } from "next";

import { TransactionsView } from "@/components/dashboard-views/transactions-view";
import { getTransactionsData } from "@/lib/detail-data";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  return <TransactionsView data={await getTransactionsData()} />;
}
