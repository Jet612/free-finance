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

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ConnectionRow, ConnectionsData } from "@/lib/data";
import { formatCurrency, formatDateTime, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

const stateBadges: Record<
  ConnectionRow["state"],
  { label: string; icon: typeof Check; className: string }
> = {
  connected: {
    label: "Connected",
    icon: Check,
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  importing: {
    label: "Importing…",
    icon: LoaderCircle,
    className: "bg-primary/10 text-primary",
  },
  "needs-reconnect": {
    label: "Needs you to sign in",
    icon: TriangleAlert,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  trouble: {
    label: "Having trouble",
    icon: CircleDashed,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
};

function ConnectionCard({
  connection,
  actions,
}: {
  connection: ConnectionRow;
  actions: ReactNode;
}) {
  const badge = stateBadges[connection.state];
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">
              {connection.institutionName}
            </CardTitle>
            <CardDescription className="mt-1">
              {connection.lastSuccessAt
                ? `Updated ${formatDateTime(connection.lastSuccessAt)}`
                : "Bringing in your accounts. This usually takes about a minute."}
            </CardDescription>
          </div>
          <Badge variant="secondary" className={cn("hover:bg-inherit", badge.className)}>
            <badge.icon
              className={cn(connection.state === "importing" && "animate-spin")}
            />
            {badge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {connection.message && (
          <p className="text-sm leading-6 text-amber-700 dark:text-amber-400">
            {connection.message}
          </p>
        )}
        {connection.accounts.length > 0 && (
          <div className="divide-y">
            {connection.accounts.map((account) => (
              <div
                key={`${account.name}-${account.mask}`}
                className="flex items-center justify-between gap-4 py-2.5 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {account.name}
                    {account.mask && (
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        ··{account.mask}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {titleCase(account.type)}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm font-medium tabular-nums">
                  {formatCurrency(account.balance)}
                </p>
              </div>
            ))}
          </div>
        )}
        {actions}
      </CardContent>
    </Card>
  );
}

const reassurances = [
  {
    icon: LockKeyhole,
    title: "Your bank password stays with your bank",
    detail:
      "You sign in on Plaid's secure page. This app never sees or stores your password.",
  },
  {
    icon: EyeOff,
    title: "Read-only",
    detail: "This app can see your balances and activity. It can't move money.",
  },
  {
    icon: CalendarClock,
    title: "Updates once a day",
    detail:
      "Your accounts refresh automatically every morning, with no need to keep anything open.",
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

  return (
    <div className="grid gap-6 lg:gap-8">
      <PageHeader title="Connections" />
      {notice}

      {data.issues.map((issue) => (
        <Alert key={issue.key} className="border-amber-500/40 bg-amber-500/5">
          <TriangleAlert className="text-amber-600 dark:text-amber-400" />
          <AlertTitle>{issue.title}</AlertTitle>
          <AlertDescription>{issue.detail}</AlertDescription>
        </Alert>
      ))}

      {data.unmanagedAccounts > 0 && (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <TriangleAlert className="text-amber-600 dark:text-amber-400" />
          <AlertTitle>
            {data.unmanagedAccounts} account
            {data.unmanagedAccounts === 1 ? " isn't" : "s aren't"} updating
          </AlertTitle>
          <AlertDescription>
            {data.unmanagedAccounts === 1 ? "It was" : "They were"} connected by
            an earlier version of this app. To keep{" "}
            {data.unmanagedAccounts === 1 ? "it" : "them"} updating, follow
            &ldquo;Upgrading an older install&rdquo; in the README.
          </AlertDescription>
        </Alert>
      )}

      {empty ? (
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">
              Connect your first account
            </CardTitle>
            <CardDescription>
              Choose what to connect, then sign in to it on Plaid&apos;s secure
              page. It takes about two minutes.
            </CardDescription>
          </CardHeader>
          <CardContent>{addControls}</CardContent>
        </Card>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            {data.connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                actions={renderActions(connection)}
              />
            ))}
          </section>
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Add another</CardTitle>
              <CardDescription>
                Investment accounts include Robinhood, Fidelity, and other
                brokerages.
              </CardDescription>
            </CardHeader>
            <CardContent>{addControls}</CardContent>
          </Card>
        </>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {reassurances.map((item) => (
          <div key={item.title} className="flex gap-3">
            <item.icon
              className="mt-0.5 size-4 shrink-0 text-primary"
              strokeWidth={1.8}
            />
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
