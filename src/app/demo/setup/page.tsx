import type { Metadata } from "next";
import { Landmark, TrendingUp } from "lucide-react";

import { ConnectionsView } from "@/components/dashboard-views/connections-view";
import { Button } from "@/components/ui/button";
import { mockConnectionsData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Connections demo" };

export default function DemoSetupPage() {
  return (
    <ConnectionsView
      data={mockConnectionsData}
      addControls={
        <div className="grid gap-3 sm:grid-cols-2">
          <Button disabled>
            <Landmark />
            Add a bank or credit card
          </Button>
          <Button variant="outline" disabled>
            <TrendingUp />
            Add an investment account
          </Button>
        </div>
      }
      renderActions={() => (
        <p className="text-xs text-muted-foreground">
          This demo never contacts a bank. All names and balances are fictional.
        </p>
      )}
    />
  );
}
