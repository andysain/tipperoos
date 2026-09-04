import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { AppShell } from "@/components/nav/AppShell";
import { TimezoneSync } from "@/components/nav/TimezoneSync";
import { getSessionIsAdmin } from "@/app/_lib/admin-access";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tipperoos",
  description: "Premier League tipping competition for our crew.",
};

// viewportFit: "cover" is required for env(safe-area-inset-*) to report
// real device values -- the fixed bottom tab bar and Switch Player button
// both rely on it.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Render-only: decides whether the More menu shows the "Competition admin"
  // entry. The server-side requireAdmin() on /admin is the actual gate --
  // this boolean grants nothing (spec §4 rule 5). Wrapped in React cache(),
  // so the /admin page's own requireAdmin() call reuses this lookup.
  const isAdmin = await getSessionIsAdmin();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TimezoneSync />
        <AppShell isAdmin={isAdmin}>{children}</AppShell>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
