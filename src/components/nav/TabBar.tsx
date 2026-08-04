"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TAB_BAR_HEIGHT_CLASS } from "./shell-metrics";
import { TABS } from "./tabs";

// Fixed bottom tab bar, used at every breakpoint (docs/adr/0004-app-navigation-shell.md
// -- no swap to a top nav/sidebar on tablet/desktop). Sits below the picker
// drawer's z-20/z-30 overlay (see PredictTableFlow.tsx) so the drawer covers
// it while open.
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-paper-line bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      <ul className={`flex ${TAB_BAR_HEIGHT_CLASS}`}>
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          const toneClass = active
            ? "text-accent stroke-accent"
            : "text-ink/60 stroke-ink/60";
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  // Tapping the already-active tab scrolls back to the top
                  // rather than doing nothing or re-navigating -- pinned
                  // down now (docs/adr/0004-app-navigation-shell.md) so
                  // behavior doesn't silently diverge once a second tab
                  // exists.
                  if (active) {
                    event.preventDefault();
                    window.scrollTo({
                      top: 0,
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "auto"
                        : "smooth",
                    });
                  }
                }}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-xs font-bold ${toneClass}`}
              >
                <Icon className={`size-6 ${toneClass}`} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
