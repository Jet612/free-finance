import type { Metadata } from "next";

import { SubscriptionsView } from "@/components/dashboard-views/subscriptions-view";
import { SubscriptionAddForm } from "@/components/subscription-add-form";
import { SubscriptionRuleButton } from "@/components/subscription-rule-button";
import { getSubscriptionsData } from "@/lib/detail-data";

export const metadata: Metadata = { title: "Bills & subscriptions" };

export default async function SubscriptionsPage() {
  const data = await getSubscriptionsData();
  return (
    <SubscriptionsView
      data={data}
      addForm={<SubscriptionAddForm transactions={data.transactionChoices} />}
      renderRuleButton={(subscription) =>
        subscription.source === "Automatic" ? (
          <SubscriptionRuleButton
            mode="dismiss"
            streamKey={subscription.streamKey}
            merchant={subscription.merchant}
          />
        ) : subscription.ruleId ? (
          <SubscriptionRuleButton
            mode="remove"
            ruleId={subscription.ruleId}
            merchant={subscription.merchant}
          />
        ) : null
      }
      renderBillButton={(bill) => (
        <SubscriptionRuleButton mode="dismiss" streamKey={bill.streamKey} merchant={bill.merchant} />
      )}
      renderRestoreButton={(rule) => (
        <SubscriptionRuleButton mode="restore" ruleId={rule.id} merchant={rule.merchant} />
      )}
    />
  );
}
