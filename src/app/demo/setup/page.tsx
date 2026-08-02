import type { Metadata } from "next";
import { Check, CircleDashed, CloudCog, Database, RefreshCw, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { mockSetupData as data } from "@/lib/demo-data";
import { formatDateTime } from "@/lib/format";
import type { SetupSource } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Connections demo" };

function sourceSummary(source: SetupSource): string {
  return [
    source.source === "plaid" ? `${source.connections} connections` : null,
    `${source.accounts} accounts`,
    source.source === "plaid" ? source.institutions.join(", ") : null,
    `Last success ${formatDateTime(source.lastSuccessAt)}`,
  ].filter(Boolean).join(" · ");
}

export default function DemoSetupPage() {
  return (
    <div className="grid gap-6 lg:gap-8">
      <PageHeader title="Connections" />
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-3"><div className="flex items-center justify-between"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Database className="size-4" /></span><Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"><Check />Connected</Badge></div></CardHeader>
          <CardContent><p className="font-medium">Supabase PostgreSQL</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Schema reachable with server-only credentials.</p></CardContent>
        </Card>
        {data.sources.map((source) => (
          <Card key={source.source} className="border-border/70 shadow-none">
            <CardHeader className="pb-3"><div className="flex items-center justify-between"><span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{source.source === "plaid" ? <CloudCog className="size-4" /> : <RefreshCw className="size-4" />}</span><Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 hover:bg-inherit dark:text-emerald-400"><Check />Connected</Badge></div></CardHeader>
            <CardContent><p className="font-medium">{source.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{sourceSummary(source)}</p></CardContent>
          </Card>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-border/70 shadow-none">
          <CardHeader><CardTitle>Deployment checklist</CardTitle><CardDescription>3 of 3 core services have reported healthy</CardDescription></CardHeader>
          <CardContent className="grid gap-5">
            <Progress value={100} />
            <div className="grid gap-1">
              <ChecklistRow title="Database schema" detail="RLS-protected tables are live in Supabase." /><Separator />
              <ChecklistRow title="Financial institutions" detail="Authorize any institution supported by Plaid Transactions in your configured countries." /><Separator />
              <ChecklistRow title="Three-hour automation" detail="Scheduled and manual runs share one non-overlapping workflow." />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-none">
          <CardHeader><CardTitle>Demo connection</CardTitle><CardDescription>Sample providers only</CardDescription></CardHeader>
          <CardContent>
            <div className="rounded-xl border bg-muted/35 p-4 text-xs leading-6 text-muted-foreground">This public demo never contacts a financial institution or stores credentials.</div>
            <Button variant="outline" className="mt-4 w-full" disabled><CircleDashed />Connect another account</Button>
            <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />All balances and provider names on this page are fictional.</div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ChecklistRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground")}><Check className="size-3" strokeWidth={3} /></span>
      <div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p></div>
    </div>
  );
}
