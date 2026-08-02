import type { Metadata } from "next";

import { DemoSecuritySettings } from "@/components/demo-security-settings";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Security demo" };

export default function DemoSecurityPage() {
  return (
    <div className="grid gap-6">
      <PageHeader title="Security" />
      <DemoSecuritySettings />
    </div>
  );
}
