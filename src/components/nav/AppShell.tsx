"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { TAB_BAR_HEIGHT_REM } from "./shell-metrics";
import { SwitchPlayerButton } from "./SwitchPlayerButton";
import { TabBar } from "./TabBar";

// Reserves content space once, at the shell level, rather than each page
// retrofitting its own viewport math (docs/adr/0004-app-navigation-shell.md).
// Login is the only excluded route -- pre-auth, nothing to navigate to yet.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showChrome = pathname !== "/login";

  if (!showChrome) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SwitchPlayerButton />
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{
          paddingBottom: `calc(${TAB_BAR_HEIGHT_REM} + env(safe-area-inset-bottom))`,
        }}
      >
        {children}
      </div>
      <TabBar />
    </div>
  );
}
