import type { Metadata } from "next";

import { DemoSubscriptionAddForm, DemoSubscriptionRuleButton } from "@/components/demo-actions";
import { SubscriptionsView } from "@/components/dashboard-views/subscriptions-view";
import { mockSubscriptionsData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Subscriptions demo" };

export default function DemoSubscriptionsPage() {
  return (
    <SubscriptionsView
      data={mockSubscriptionsData}
      addForm={<DemoSubscriptionAddForm transactions={mockSubscriptionsData.transactionChoices} />}
      renderRuleButton={(subscription) => <DemoSubscriptionRuleButton mode={subscription.source === "Automatic" ? "dismiss" : "remove"} />}
    />
  );
}
