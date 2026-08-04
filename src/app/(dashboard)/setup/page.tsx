import type { Metadata } from "next";
import {
  Check,
  CircleDashed,
  CloudCog,
  Database,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { getSetupData, type SetupSource } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Connections",
};

function sourcePresentation(status: SetupSource["status"]) {
  if (status === "connected") {
    return {
      label: "Connected",
      icon: Check,
      className:
        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    };
  }
  if (status === "needs-attention") {
    return {
      label: "Needs attention",
      icon: TriangleAlert,
      className: "bg-destructive/10 text-destructive",
    };
  }
  if (status === "optional") {
    return {
      label: "Optional",
      icon: CircleDashed,
      className: "bg-muted text-muted-foreground",
    };
  }
  return {
    label: "Pending first sync",
    icon: CircleDashed,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  };
}

function sourceSummary(source: SetupSource): string {
  if (!source.accounts) {
    return source.source === "plaid"
      ? "Complete Hosted Link and run the workflow."
      : "Add credentials only if you want brokerage sync.";
  }

  const accountLabel = `${source.accounts} account${source.accounts === 1 ? "" : "s"}`;
  const connectionLabel =
    source.source === "plaid" && source.connections
      ? `${source.connections} connection${source.connections === 1 ? "" : "s"}`
      : null;
  const institutionLabel =
    source.source === "plaid" && source.institutions.length
      ? source.institutions.join(", ")
      : null;

  return [
    connectionLabel,
    accountLabel,
    institutionLabel,
    `Last success ${formatDateTime(source.lastSuccessAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default async function SetupPage() {
  const data = await getSetupData();
  const completed =
    1 + data.sources.filter((source) => source.status === "connected").length;
  const progress = Math.round((completed / 3) * 100);
  const robinhoodNeedsRelink = data.sources.some(
    (source) =>
      source.source === "robinhood" &&
      source.status === "needs-attention" &&
      (source.lastError?.toLowerCase().includes("accounts were unavailable") ||
        source.lastError?.toLowerCase().includes("session expired") ||
        source.lastError?.toLowerCase().includes("session was revoked")),
  );

  return (
    <div className="grid gap-6 lg:gap-8">
      <PageHeader title="Connections" />

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Database className="size-4" />
              </span>
              <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400">
                <Check />
                Connected
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="font-medium">Supabase PostgreSQL</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Schema reachable with server-only credentials.
            </p>
          </CardContent>
        </Card>

        {data.sources.map((source) => {
          const presentation = sourcePresentation(source.status);
          return (
            <Card
              key={source.source}
              className="border-border/70 shadow-none"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {source.source === "plaid" ? (
                      <CloudCog className="size-4" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "hover:bg-inherit",
                      presentation.className,
                    )}
                  >
                    <presentation.icon />
                    {presentation.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{source.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {sourceSummary(source)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {data.sources.some(
        (source) => source.status === "needs-attention",
      ) && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>A provider needs attention</AlertTitle>
          <AlertDescription className="grid gap-3 text-balance">
            <p>
              {data.sources
                .filter((source) => source.status === "needs-attention")
                .map((source) => `${source.label}: ${source.lastError}`)
                .join(" · ")}
            </p>
            {robinhoodNeedsRelink && (
              <div className="grid gap-2">
                <p>
                  The Robinhood session may have expired. From the project
                  directory, renew it and approve the newest login request in
                  the Robinhood app:
                </p>
                <pre className="overflow-x-auto rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 font-mono text-xs text-foreground">
                  <code className="select-all">
                    .venv/bin/python scripts/robinhood_link.py --github
                  </code>
                </pre>
                <p>Then verify the renewed session:</p>
                <pre className="overflow-x-auto rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 font-mono text-xs text-foreground">
                  <code className="select-all">
                    .venv/bin/python scripts/sync.py --source robinhood --dry-run
                  </code>
                </pre>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle>Deployment checklist</CardTitle>
            <CardDescription>
              {completed} of 3 core services have reported healthy
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Progress value={progress} />
            <div className="grid gap-1">
              <ChecklistRow
                complete
                title="Database schema"
                detail="RLS-protected tables are live in Supabase."
              />
              <Separator />
              <ChecklistRow
                complete={
                  data.sources.find((source) => source.source === "plaid")
                    ?.status === "connected"
                }
                title="Financial institutions"
                detail="Authorize any institution supported by Plaid Transactions in your configured countries."
              />
              <Separator />
              <ChecklistRow
                complete={
                  data.sources.some(
                    (source) => source.status === "connected",
                  )
                }
                title="Three-hour automation"
                detail="Scheduled and manual runs share one non-overlapping workflow."
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-none">
          <CardHeader>
            <CardTitle>Next action</CardTitle>
            <CardDescription>
              Commands run from your private repository
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border bg-muted/35 p-4 font-mono text-xs leading-6">
              <p className="text-muted-foreground">
                # Add a Plaid institution
              </p>
              <p>.venv/bin/python scripts/plaid_link.py --github</p>
              <p className="mt-3 text-muted-foreground"># Verify and sync</p>
              <p>.venv/bin/python scripts/sync.py</p>
            </div>
            <Button asChild variant="outline" className="mt-4 w-full">
              <a
                href="https://github.com/Jet612/free-finance/actions"
                target="_blank"
                rel="noreferrer"
              >
                Open GitHub Actions
                <ExternalLink />
              </a>
            </Button>
            <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
              Plaid and Robinhood credentials are intentionally absent from
              Vercel.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ChecklistRow({
  complete,
  title,
  detail,
}: {
  complete?: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          complete
            ? "bg-primary text-primary-foreground"
            : "border text-muted-foreground",
        )}
      >
        {complete ? (
          <Check className="size-3" strokeWidth={3} />
        ) : (
          <CircleDashed className="size-3" />
        )}
      </span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}
