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
  // this boolean grants nothing (spec §4 rule 5).
  //
  // Cost: one `players` lookup per request, here in the layout. It's
  // cache()-wrapped, so /admin's own requireAdmin() reuses it rather than
  // paying twice; and layout and page are RSC siblings, so this await runs
  // concurrently with each page's own loaders rather than adding to their
  // round-trip depth (PERFORMANCE_TESTING_STANDARD.md §1/§4). Accepted for a
  // ~20-player app; revisit if the roster or traffic grows.
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
