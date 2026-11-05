import type { Metadata } from "next";

import { TransactionsView } from "@/components/dashboard-views/transactions-view";
import { getTransactionsData } from "@/lib/detail-data";
import { parseTransactionFilters } from "@/lib/transaction-filters";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const open = Number(params.open);
  const data = await getTransactionsData(
    parseTransactionFilters(params),
    Number.isInteger(open) && open > 0 ? open : undefined,
  );
  return <TransactionsView data={data} searchParams={params} />;
}
