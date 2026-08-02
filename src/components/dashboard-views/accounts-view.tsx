import { CircleDollarSign, Landmark, ShieldCheck, WalletCards } from "lucide-react";

import { AccountTable } from "@/components/account-table";
import { PageHeader } from "@/components/page-header";
import { SummaryStrip } from "@/components/summary-strip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountsData } from "@/lib/detail-data";
import { formatCurrency } from "@/lib/format";

export function AccountsView({ data }: { data: AccountsData }) {
  return (
    <div className="grid gap-7">
      <PageHeader title="Accounts" />
      <SummaryStrip items={[
        { label: "Total assets", value: formatCurrency(data.metrics.assets), icon: WalletCards },
        { label: "Liabilities", value: formatCurrency(data.metrics.liabilities), icon: CircleDollarSign, tone: data.metrics.liabilities ? "negative" : "default" },
        { label: "Available cash", value: formatCurrency(data.metrics.availableCash), icon: Landmark },
        { label: "Connected", value: `${data.metrics.connected} accounts`, detail: "Included in current net worth", icon: ShieldCheck },
      ]} />
      <Card className="shadow-none"><CardHeader className="border-b"><CardTitle>Connected accounts</CardTitle><CardDescription>Balances refresh with each provider sync; history remains one end-of-day snapshot per account.</CardDescription></CardHeader><CardContent><AccountTable accounts={data.accounts} /></CardContent></Card>
    </div>
  );
}
