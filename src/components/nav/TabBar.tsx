"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { TAB_BAR_HEIGHT_CLASS } from "./shell-metrics";
import { TABS } from "./tabs";
import { MoreMenuItems } from "./MoreMenu";
import { FOCUS, T, TX } from "@/components/ui/tokens";

// Fixed bottom tab bar, used at every breakpoint (docs/adr/0004-app-navigation-shell.md
// -- no swap to a top nav/sidebar on tablet/desktop). The 4th "More" slot
// (docs/adr/0005-app-navigation-shell.md amendment, issue #185) opens a menu
// rather than navigating -- it replaces the old fixed top-right
// SwitchPlayerButton/HelpButton, which had no scroll-away and covered page
// content. The menu (MoreMenuItems) is its own small elevated card
// anchored above the More tab, not a full-width extension of this bar --
// the bar's own look never changes when it opens.
export function TabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
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
    <>
      {moreOpen ? (
        // Invisible click-catcher, not a dimming scrim: nothing else in the
        // page changes when the bar grows, so nothing else needs dimming --
        // this only exists to close the menu on an outside tap.
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-[5]"
        />
      ) : null}
      <nav
        aria-label="Main"
        // Never changes shape when the menu opens -- there's nothing here
        // for a rounded top edge or shadow to attach to that isn't already
        // owned by the menu panel itself (see below).
        className="fixed inset-x-0 bottom-0 z-10 border-t border-paper-line bg-paper pb-[env(safe-area-inset-bottom)]"
      >
        {moreOpen ? (
          // A small elevated card of its own, anchored above the More tab
          // -- not a full-width extension of the bar. A full-width "the bar
          // grew" treatment (rounded top edge + shadow spanning the whole
          // bar) only makes sense if content actually fills that width;
          // once the panel is sized to its own content (right-anchored,
          // shrink-wrapped -- see MoreMenu.tsx) rather than stretched, a
          // full-width bar shape around a narrow panel just reads as an
          // empty rounded corner with nothing in it. mb-2 gives it real,
          // deliberate breathing room above the tab row, instead of
          // padding that happened to be invisible against the page.
          <div className="flex justify-end px-2">
            <MoreMenuItems onClose={() => setMoreOpen(false)} />
          </div>
        ) : null}
        <ul className={`flex ${TAB_BAR_HEIGHT_CLASS}`}>
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            const Icon = tab.icon;
            const toneClass = active
              ? "text-accent stroke-accent"
              : `${TX.muted} stroke-ink/60`;
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
                  className={`relative flex h-full flex-col items-center justify-center gap-0.5 ${T.label} font-bold ${toneClass} ${FOCUS}`}
                >
                  {/* Anchored to the TAB, not hung off the label. Hung off a
                    label that already fills its ~125px tab, this pushed 19px
                    off a 375px viewport and rendered clipped -- and it was
                    set at 0.6rem, below the hard 0.7rem floor. It is the
                    onboarding affordance ADR 0007 relies on to make Predict
                    the Table discoverable without a hub, so it clipping is
                    not cosmetic. Shortened to "New" so it fits a tab. */}
                  {tab.href === "/predict-table" && needsTablePrediction ? (
                    <span
                      className={`absolute top-1 right-2 rounded-badge bg-accent px-1.5 py-px ${T.label} font-extrabold text-accent-ink`}
                    >
                      New
                    </span>
                  ) : null}
                  <Icon className={`size-6 ${toneClass}`} />
                  <span>{tab.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className={`relative flex h-full w-full flex-col items-center justify-center gap-0.5 ${T.label} font-bold ${
                moreOpen
                  ? "text-accent stroke-accent"
                  : `${TX.muted} stroke-ink/60`
              } ${FOCUS}`}
            >
              <MoreHorizontal
                className={`size-6 ${moreOpen ? "stroke-accent" : "stroke-ink/60"}`}
              />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
