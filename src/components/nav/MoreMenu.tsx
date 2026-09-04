"use client";

import Link from "next/link";
import { HelpCircle, LogOut, Wrench } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CARD_SHADOW, FOCUS, T } from "@/components/ui/tokens";

// The "More" tab's menu items (docs/adr/0005-app-navigation-shell.md
// amendment, issue #185). Replaces the old fixed top-right SwitchPlayerButton
// and HelpButton, which had no scroll-away and covered page content.
//
// Its own small elevated card (full rounded-card + CARD_SHADOW), anchored
// above the More tab that opens it -- not a full-width extension of
// TabBar's <nav>. An earlier version tried to make the whole bar "grow" to
// hold this row, but that only works if the row fills the bar; once it's
// sized to its own content instead of stretched, a full-width bar shape
// around a narrow panel just reads as an empty rounded corner with nothing
// in it. Being honestly its own card is what actually reads as "menu
// opened here" at every breakpoint, phone through desktop.
// `isAdmin` is a render-only hint threaded from the root layout
// (docs/admin-ui-spec.md §4 rule 5) -- it decides whether the "Competition
// admin" entry shows, and grants nothing. `/admin` itself is gated
// server-side by requireAdmin(), which 404s a non-admin regardless.
export function MoreMenuItems({
  isAdmin = false,
  onClose,
}: {
  isAdmin?: boolean;
  onClose: () => void;
}) {
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
      // inline-flex flex-col: shrink-wraps to the widest menu item's
      // content instead of a fixed/max width guessed per breakpoint -- a
      // wide box left visible empty space next to short labels ("How it
      // works"), and a full-width one on desktop read as an unrelated
      // banner disconnected from the far-right "More" tab that opened it.
      // Full rounded-card + CARD_SHADOW + border on every side, mb-2 for
      // real breathing room above the tab row: this is its own card, not
      // a slice of the bar underneath it.
      className={`mb-2 inline-flex flex-col rounded-card border border-paper-line bg-white p-2 ${CARD_SHADOW}`}
    >
      {isAdmin ? (
        <Link
          href={{ pathname: "/admin" }}
          role="menuitem"
          onClick={onClose}
          className={`flex items-center gap-3 rounded-btn p-3 ${T.body} font-bold text-ink hover:bg-paper ${FOCUS}`}
        >
          <span className="flex size-8 items-center justify-center rounded-badge border border-paper-line">
            <Wrench className="size-4 stroke-ink stroke-2" />
          </span>
          Competition admin
        </Link>
      ) : null}
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
