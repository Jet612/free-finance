import type { Metadata } from "next";
import { headers } from "next/headers";

import { DashboardShell } from "@/components/dashboard-shell";

const description =
  "Explore the real Free Finance dashboard with safe, realistic sample data.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host")?.split(",").at(0)?.trim() ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto")?.split(",").at(0)?.trim() ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const image = `${origin}/og-demo-v2.png`;

  return {
    title: "Interactive demo",
    description,
    alternates: { canonical: `${origin}/demo` },
    openGraph: {
      title: "Free Finance · Interactive demo",
      description,
      url: `${origin}/demo`,
      type: "website",
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: "Free Finance interactive dashboard demo",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Free Finance · Interactive demo",
      description,
      images: [image],
    },
  };
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell demo>{children}</DashboardShell>;
}
