"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TAB_BAR_HEIGHT_REM } from "./shell-metrics";
import { TabBar } from "./TabBar";

// Reserves content space once, at the shell level, rather than each page
// retrofitting its own viewport math (docs/adr/0004-app-navigation-shell.md).
// Excluded routes render bare: /login (pre-auth, nothing to navigate to) and
// /reset-pin (a forced-PIN-reset dead-end -- the player must not have tab
// links out of it; issue #36).
const BARE_ROUTES = new Set(["/login", "/reset-pin"]);

export function AppShell({
  children,
  isAdmin = false,
}: {
  children: ReactNode;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const showChrome = !BARE_ROUTES.has(pathname);

  if (!showChrome) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{
          paddingBottom: `calc(${TAB_BAR_HEIGHT_REM} + env(safe-area-inset-bottom))`,
        }}
      >
        {children}
      </div>
      <TabBar isAdmin={isAdmin} />
    </div>
  );
}
