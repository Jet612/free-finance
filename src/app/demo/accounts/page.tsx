import type { Metadata } from "next";

import { AccountsView } from "@/components/dashboard-views/accounts-view";
import { getMockAccountsData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Net worth demo" };

export default function DemoAccountsPage() {
  return <AccountsView data={getMockAccountsData()} basePath="/demo" demo />;
}
