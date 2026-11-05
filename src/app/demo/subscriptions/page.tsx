import type { Metadata } from "next";

import { DemoSubscriptionRuleButton } from "@/components/demo-actions";
import { SubscriptionsView } from "@/components/dashboard-views/subscriptions-view";
import { SubscriptionAddForm } from "@/components/subscription-add-form";
import { getMockSubscriptionsData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Bills & subscriptions demo" };

export default function DemoSubscriptionsPage() {
  const data = getMockSubscriptionsData();
  return (
    <SubscriptionsView
      data={data}
      basePath="/demo"
      renderBillButton={(bill) => <DemoSubscriptionRuleButton mode="dismiss" merchant={bill.merchant} />}
      addForm={<SubscriptionAddForm transactions={data.transactionChoices} demo />}
      renderRuleButton={(subscription) => (
        <DemoSubscriptionRuleButton
          mode={subscription.source === "Automatic" ? "dismiss" : "remove"}
          merchant={subscription.merchant}
        />
      )}
    />
  );
}
