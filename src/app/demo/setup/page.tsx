import type { Metadata } from "next";
import { Landmark, TrendingUp } from "lucide-react";

import { ConnectionsView } from "@/components/dashboard-views/connections-view";
import { Button } from "@/components/ui/button";
import { getMockConnectionsData } from "@/lib/demo-data";

export const metadata: Metadata = { title: "Connections demo" };

export default function DemoSetupPage() {
  return (
    <ConnectionsView
      data={getMockConnectionsData()}
      addControls={
        <div className="grid gap-3 sm:grid-cols-2">
          <Button className="h-10" disabled>
            <Landmark />
            Add a bank or credit card
          </Button>
          <Button variant="outline" className="h-10" disabled>
            <TrendingUp />
            Add an investment account
          </Button>
        </div>
      }
      renderActions={(connection) =>
        connection.state === "needs-reconnect" ? (
          <p className="text-[0.8125rem] text-muted-foreground">
            In your own copy, a Reconnect button appears here. This demo never contacts a bank.
          </p>
        ) : null
      }
    />
  );
}
