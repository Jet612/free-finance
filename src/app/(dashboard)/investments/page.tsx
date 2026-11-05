import type { Metadata } from "next";

import { AddConnectionButtons } from "@/components/connection-controls";
import { InvestmentsView } from "@/components/dashboard-views/investments-view";
import { getInvestmentsData } from "@/lib/detail-data";

export const metadata: Metadata = { title: "Investments" };

export default async function InvestmentsPage() {
  return (
    <InvestmentsView
      data={await getInvestmentsData()}
      emptyAction={<AddConnectionButtons only="investment" />}
    />
  );
}
