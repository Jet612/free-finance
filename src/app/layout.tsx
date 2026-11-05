import type { Metadata } from "next";
import { Hanken_Grotesk, Mona_Sans } from "next/font/google";
import { cookies, headers } from "next/headers";

import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HIDE_AMOUNTS_COOKIE } from "@/lib/privacy";

import "./globals.css";

// One family: the width axis gives us the wide cut for figures and headlines.
const monaSans = Mona_Sans({
  variable: "--font-mona",
  subsets: ["latin"],
  axes: ["wdth"],
});

// Mona's tabular digits are a slashed, typewriter-style set. Columns of money
// use these instead, which match its proportions without the slashed zero.
const figures = Hanken_Grotesk({
  variable: "--font-figures",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: process.env.APP_NAME ?? "Free Finance",
    template: `%s · ${process.env.APP_NAME ?? "Free Finance"}`,
  },
  description:
    "A private, self-hosted dashboard for bank balances, spending, and investments.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The theme script runs before hydration, so it needs the CSP nonce too.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // A cookie, so hidden amounts are hidden in the very first paint.
  const hideAmounts = (await cookies()).get(HIDE_AMOUNTS_COOKIE)?.value === "1";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-hide-amounts={hideAmounts ? "true" : undefined}
      className={`${monaSans.variable} ${figures.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
