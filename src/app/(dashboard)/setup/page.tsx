import type { Metadata } from "next";
import { Check, Info } from "lucide-react";

import {
  AddConnectionButtons,
  ImportWatcher,
  ReconnectButton,
  RemoveConnectionButton,
} from "@/components/connection-controls";
import { ConnectionsView } from "@/components/dashboard-views/connections-view";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { getConnectionsData } from "@/lib/data";

export const metadata: Metadata = {
  title: "Connections",
};

const notices: Record<string, { text: string; success: boolean }> = {
  new: {
    text: "Connected! Your accounts are coming in now, which usually takes about a minute.",
    success: true,
  },
  repaired: {
    text: "Thanks. Checking the connection now.",
    success: true,
  },
  duplicate: {
    text: "That account is already connected, so nothing was added.",
    success: false,
  },
  cancelled: {
    text: "Nothing was connected. You can try again whenever you're ready.",
    success: false,
  },
  failed: {
    text: "That connection couldn't be saved. Please try again.",
    success: false,
  },
  unrevoked: {
    text: "Removed here, but Plaid may still have access because CRON_SECRET changed. To fully cut it off, remove the connection in your Plaid dashboard.",
    success: false,
  },
};

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string | string[] }>;
}) {
  const [{ connected }, data] = await Promise.all([
    searchParams,
    getConnectionsData(),
  ]);
  const notice = typeof connected === "string" ? notices[connected] : undefined;
  const importing = data.connections.some(
    (connection) => connection.state === "importing",
  );

  return (
    <>
      {importing && <ImportWatcher />}
      <ConnectionsView
        data={data}
        addControls={<AddConnectionButtons />}
        notice={
          notice && (
            <Alert>
              {notice.success ? <Check className="text-positive" /> : <Info />}
              <AlertTitle>{notice.text}</AlertTitle>
            </Alert>
          )
        }
        renderActions={(connection) => (
          <div className="flex flex-wrap items-center gap-2">
            {connection.state === "needs-reconnect" && (
              <ReconnectButton itemId={connection.id} />
            )}
            <RemoveConnectionButton
              itemId={connection.id}
              institution={connection.institutionName}
            />
          </div>
        )}
      />
    </>
  );
}
