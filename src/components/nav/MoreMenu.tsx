"use client";

import Link from "next/link";
import { HelpCircle, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { FOCUS, T } from "@/components/ui/tokens";

// The "More" tab's menu items (docs/adr/0005-app-navigation-shell.md
// amendment, issue #185). Replaces the old fixed top-right SwitchPlayerButton
// and HelpButton, which had no scroll-away and covered page content.
//
// Rendered directly inside TabBar's own <nav> card, which grows upward to
// hold this row rather than a separate floating panel opening near it
// (docs/adr/0005 amendment, "Approach A") -- there's only ever one surface,
// so there's nothing to look visually disconnected from the tab that opened
// it.
export function MoreMenuItems({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const onHelpPage = pathname === "/how-it-works";
  const [pending, setPending] = useState(false);

  async function handleSwitchPlayer() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "x-tipperoos-client": "1" },
      });
    } finally {
      // Full route navigation, not an in-place auth swap: the whole route
      // tree unmounts, which is what destroys any in-progress client state
      // (e.g. Predict the Table's picker selection) for a shared-device
      // switch -- no explicit reset plumbing needed.
      router.push("/login");
    }
  }

  return (
    <div
      role="menu"
      aria-label="More"
      // bg-white against the icon row's bg-paper, plus a heavier border-b,
      // is what separates "an action list" from "navigation" -- a hairline
      // alone read as one continuous list of five items. rounded-tr-card
      // nests this panel inside the bar's own rounded top-right corner
      // (it sits flush against the bar's top and right edges); border-l/t
      // give its other two edges -- the ones not already bounded by the
      // bar itself -- a visible outline against the exposed paper-colored
      // strip beside it.
      className="rounded-tr-card border-t-2 border-b-2 border-l-2 border-paper-line bg-white p-2"
    >
      {onHelpPage ? (
        // Already on /how-it-works -- a Link to the same page would be a
        // no-op navigation, so this instead returns to wherever the player
        // came from, carrying forward HelpButton's old "back" variant
        // behavior.
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            router.back();
          }}
          className={`flex w-full items-center gap-3 rounded-btn p-3 ${T.body} font-bold text-ink transition hover:bg-paper ${FOCUS}`}
        >
          <span className="flex size-8 items-center justify-center rounded-badge border border-paper-line">
            <HelpCircle className="size-4 stroke-ink stroke-2" />
          </span>
          Back to previous page
        </button>
      ) : (
        <Link
          href={{ pathname: "/how-it-works" }}
          role="menuitem"
          onClick={onClose}
          className={`flex items-center gap-3 rounded-btn p-3 ${T.body} font-bold text-ink hover:bg-paper ${FOCUS}`}
        >
          <span className="flex size-8 items-center justify-center rounded-badge border border-paper-line">
            <HelpCircle className="size-4 stroke-ink stroke-2" />
          </span>
          How it works
        </Link>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={handleSwitchPlayer}
        disabled={pending}
        className={`flex w-full items-center gap-3 rounded-btn p-3 ${T.body} font-bold text-ink transition hover:bg-paper disabled:opacity-50 ${FOCUS}`}
      >
        <span className="flex size-8 items-center justify-center rounded-badge border border-paper-line">
          <LogOut className="size-4 stroke-ink stroke-2" />
        </span>
        Switch player
      </button>
    </div>
  );
}
