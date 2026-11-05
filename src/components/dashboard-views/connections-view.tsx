import type { ReactNode } from "react";
import {
  CalendarClock,
  Check,
  CircleDashed,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  TriangleAlert,
} from "lucide-react";

import { Money } from "@/components/money";
import { PageHeader, Panel, SectionHeading } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ConnectionRow, ConnectionsData } from "@/lib/data";
import { accountTypeLabel, formatDateTime, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATES: Record<
  ConnectionRow["state"],
  { label: string; icon: typeof Check; className: string }
> = {
  connected: { label: "Connected", icon: Check, className: "text-positive" },
  importing: { label: "Importing", icon: LoaderCircle, className: "text-muted-foreground" },
  "needs-reconnect": { label: "Needs you to sign in", icon: TriangleAlert, className: "text-negative" },
  trouble: { label: "Having trouble", icon: CircleDashed, className: "text-warning" },
};

function ConnectionItem({
  connection,
  actions,
}: {
  connection: ConnectionRow;
  actions: ReactNode;
}) {
  const state = STATES[connection.state];
  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="truncate text-[0.9375rem] font-semibold">{connection.institutionName}</h3>
          <p className="text-[0.8125rem] leading-[1.125rem] text-muted-foreground">
            {connection.lastSuccessAt
              ? `Updated ${formatDateTime(connection.lastSuccessAt)}`
              : "Bringing in your accounts. This usually takes about a minute."}
          </p>
        </div>
        <p className={cn("inline-flex items-center gap-1.5 text-[0.8125rem] font-medium", state.className)}>
          <state.icon
            className={cn("size-3.5", connection.state === "importing" && "animate-spin")}
            aria-hidden="true"
          />
          {state.label}
        </p>
      </div>
      {connection.message && (
        <p className="mt-2 text-sm leading-6 text-negative">{connection.message}</p>
      )}
      {connection.accounts.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-1">
          {connection.accounts.map((account) => (
            <li
              key={`${account.name}-${account.mask}`}
              className="flex items-baseline justify-between gap-4 text-sm"
            >
              <span className="min-w-0 truncate">
                {account.name}
                <span className="text-muted-foreground">
                  {account.mask && ` ending ${account.mask}`}, {accountTypeLabel(account.type)}
                </span>
              </span>
              <Money value={account.balance} className="tnum shrink-0" />
            </li>
          ))}
        </ul>
      )}
      {actions && <div className="mt-1.5">{actions}</div>}
    </li>
  );
}

const REASSURANCES = [
  {
    icon: LockKeyhole,
    title: "Your bank password stays with your bank",
    detail: "You sign in on Plaid's secure page. This app never sees or stores your password.",
  },
  {
    icon: EyeOff,
    title: "Read-only",
    detail: "This app can see your balances and activity. It can't move money.",
  },
  {
    icon: CalendarClock,
    title: "Updates once a day",
    detail: "Your accounts refresh every morning, with no need to keep anything open.",
  },
];

export function ConnectionsView({
  data,
  addControls,
  renderActions,
  notice,
}: {
  data: ConnectionsData;
  addControls: ReactNode;
  renderActions: (connection: ConnectionRow) => ReactNode;
  notice?: ReactNode;
}) {
  const empty = data.connections.length === 0;
  const needsAttention = data.connections.filter(
    (item) => item.state === "needs-reconnect" || item.state === "trouble",
  ).length;

  return (
    <div className="grid grid-cols-1 gap-8">
      <PageHeader
        title={
          empty
            ? "Connect your first account"
            : needsAttention
              ? `${plural(needsAttention, "connection")} ${needsAttention === 1 ? "needs" : "need"} you`
              : "All connections are working"
        }
        detail={
          empty
            ? "Choose what to connect, then sign in on Plaid's secure page. It takes about two minutes."
            : `${plural(data.connections.length, "institution")} connected.`
        }
      />
      {notice}

      {data.issues.map((issue) => (
        <Alert key={issue.key} className="border-warning/40">
          <TriangleAlert className="text-warning" />
          <AlertTitle>{issue.title}</AlertTitle>
          <AlertDescription>
            {issue.detail}
            {issue.key === "plaid" && (
              <span className="mt-1 flex flex-wrap gap-x-4">
                <a
                  href="https://dashboard.plaid.com/developers/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline underline-offset-3"
                >
                  Find your Plaid keys
                </a>
                <a
                  href="https://vercel.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline underline-offset-3"
                >
                  Open Vercel
                </a>
              </span>
            )}
          </AlertDescription>
        </Alert>
      ))}

      {data.unmanagedAccounts > 0 && (
        <Alert className="border-warning/40">
          <TriangleAlert className="text-warning" />
          <AlertTitle>
            {plural(data.unmanagedAccounts, "account")}{" "}
            {data.unmanagedAccounts === 1 ? "isn't" : "aren't"} updating
          </AlertTitle>
          <AlertDescription>
            {data.unmanagedAccounts === 1 ? "It was" : "They were"} connected by an
            earlier version of this app. To keep {data.unmanagedAccounts === 1 ? "it" : "them"} updating,
            follow &ldquo;Upgrading an older install&rdquo; in the README.
          </AlertDescription>
        </Alert>
      )}

      {!empty && (
        <section aria-labelledby="connections-heading">
          <h2 id="connections-heading" className="sr-only">Your connections</h2>
          <Panel>
            <ul className="divide-y">
              {data.connections.map((connection) => (
                <ConnectionItem
                  key={connection.id}
                  connection={connection}
                  actions={renderActions(connection)}
                />
              ))}
            </ul>
          </Panel>
        </section>
      )}

      <section aria-labelledby="add-heading">
        <SectionHeading
          title={<span id="add-heading">{empty ? "Choose what to connect" : "Add another"}</span>}
          detail="Investment accounts include Robinhood, Fidelity, and other brokerages."
        />
        {addControls}
      </section>

      <ul className="grid gap-5 md:grid-cols-3">
        {REASSURANCES.map((item) => (
          <li key={item.title} className="flex gap-3">
            <item.icon
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
