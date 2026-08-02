import type { Metadata } from "next";

import { AccountsView } from "@/components/dashboard-views/accounts-view";
import { getAccountsData } from "@/lib/detail-data";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage() {
  return <AccountsView data={await getAccountsData()} />;
}
