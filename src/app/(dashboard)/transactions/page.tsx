import type { Metadata } from "next";
import { ArrowDownLeft, ArrowUpRight, Clock3, WalletCards } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SummaryStrip } from "@/components/summary-strip";
import { TransactionsTable } from "@/components/transactions-table";
import { Card } from "@/components/ui/card";
import { getTransactionsData } from "@/lib/detail-data";
import { formatCurrency } from "@/lib/format";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  const data = await getTransactionsData();
  return (
    <div className="grid gap-7">
      <PageHeader
        eyebrow="Transactions"
        title="Every dollar, in order"
        description="Search and filter the latest 750 Plaid transactions. Bank-provided authorization times are shown when available."
      />
      <SummaryStrip
        items={[
          {
            label: "Income this month",
            value: formatCurrency(data.metrics.income),
            icon: ArrowDownLeft,
            tone: "positive",
          },
          {
            label: "Spent this month",
            value: formatCurrency(data.metrics.spending),
            icon: ArrowUpRight,
          },
          {
            label: "Net cash flow",
            value: formatCurrency(data.metrics.net),
            icon: WalletCards,
            tone: data.metrics.net >= 0 ? "positive" : "negative",
          },
          {
            label: "Pending",
            value: formatCurrency(data.metrics.pending),
            detail: "Not included in posted totals",
            icon: Clock3,
          },
        ]}
      />
      <Card className="py-0 shadow-none">
        <TransactionsTable
          transactions={data.transactions}
          categories={data.categories}
          accounts={data.accounts}
        />
      </Card>
    </div>
  );
}
