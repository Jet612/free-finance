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

export default async function SetupPage() {
  const data = await getSetupData();
  const completed =
    1 + data.sources.filter((source) => source.status === "connected").length;
  const progress = Math.round((completed / 3) * 100);

  return (
    <div className="grid gap-6 lg:gap-8">
      <header>
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
          System
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Connections
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Safe status only. Credentials live in local, GitHub, and Vercel
          secret stores and are never returned to this page.
        </p>
      </header>

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
                  {source.accounts
                    ? `${source.accounts} account${source.accounts === 1 ? "" : "s"} · Last success ${formatDateTime(source.lastSuccessAt)}`
                    : source.source === "plaid"
                      ? "Complete Hosted Link and run the workflow."
                      : "Add credentials only if you want brokerage sync."}
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
          <AlertDescription>
            {data.sources
              .filter((source) => source.status === "needs-attention")
              .map((source) => `${source.label}: ${source.lastError}`)
              .join(" · ")}
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
                title="Bank connection"
                detail="Authorize Bank of America through Plaid Hosted Link."
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
              <p className="text-muted-foreground"># Connect Plaid once</p>
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
