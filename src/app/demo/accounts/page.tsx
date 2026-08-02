import type { Metadata } from "next";

import { AccountsView } from "@/components/dashboard-views/accounts-view";
import { mockAccountsData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Accounts demo" };

export default function DemoAccountsPage() {
  return <AccountsView data={mockAccountsData} />;
}
