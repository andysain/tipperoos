"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { TAB_BAR_HEIGHT_CLASS } from "./shell-metrics";
import { TABS } from "./tabs";
import { FOCUS } from "@/components/ui/tokens";

// Fixed bottom tab bar, used at every breakpoint (docs/adr/0004-app-navigation-shell.md
// -- no swap to a top nav/sidebar on tablet/desktop). Sits below the picker
// drawer's z-20/z-30 overlay (see PredictTableFlow.tsx) so the drawer covers
// it while open.
export function TabBar() {
  const pathname = usePathname();
  const needsTablePrediction = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () =>
      window.localStorage.getItem("tipperoos.needsTablePrediction") === "true",
    () => false,
  );

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
                  if (tab.href === "/predict-table") {
                    window.localStorage.removeItem(
                      "tipperoos.needsTablePrediction",
                    );
                    window.dispatchEvent(new Event("storage"));
                  }
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
                className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-[0.7rem] font-bold ${toneClass} ${FOCUS}`}
              >
                {/* Anchored to the TAB, not hung off the label. Hung off a
                    label that already fills its ~125px tab, this pushed 19px
                    off a 375px viewport and rendered clipped -- and it was
                    set at 0.6rem, below the hard 0.7rem floor. It is the
                    onboarding affordance ADR 0007 relies on to make Predict
                    the Table discoverable without a hub, so it clipping is
                    not cosmetic. Shortened to "New" so it fits a tab. */}
                {tab.href === "/predict-table" && needsTablePrediction ? (
                  <span className="absolute top-1 right-2 rounded-badge bg-accent px-1.5 py-px text-[0.7rem] font-extrabold text-accent-ink">
                    New
                  </span>
                ) : null}
                <Icon className={`size-6 ${toneClass}`} />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
