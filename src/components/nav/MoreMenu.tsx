"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { FOCUS, T } from "@/components/ui/tokens";
import { TAB_BAR_HEIGHT_REM } from "./shell-metrics";

// The "More" tab's bottom-sheet menu (docs/adr/0005-app-navigation-shell.md
// amendment, issue #185). Replaces the old fixed top-right SwitchPlayerButton
// and HelpButton, which had no scroll-away and covered page content. Backdrop
// at z-20, panel at z-30 -- the overlay tiers shell-metrics.ts already
// reserves for exactly this kind of surface.
export function MoreMenu({ onClose }: { onClose: () => void }) {
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
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="fixed inset-0 z-20 bg-ink/40"
      />
      <div
        role="menu"
        aria-label="More"
        className="fixed inset-x-0 z-30 rounded-t-card border border-b-0 border-paper-line bg-paper p-2 shadow-lg shadow-ink/25"
        style={{
          bottom: `calc(${TAB_BAR_HEIGHT_REM} + env(safe-area-inset-bottom))`,
        }}
      >
        {onHelpPage ? (
          // Already on /how-it-works -- a Link to the same page would be a
          // no-op navigation, so this instead returns to wherever the
          // player came from, carrying forward HelpButton's old "back"
          // variant behavior.
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              router.back();
            }}
            className={`flex w-full items-center gap-3 rounded-btn p-3 ${T.body} font-bold text-ink transition hover:bg-white ${FOCUS}`}
          >
            <span className="flex size-8 items-center justify-center rounded-badge border border-paper-line font-extrabold">
              ?
            </span>
            Back to previous page
          </button>
        ) : (
          <Link
            href={{ pathname: "/how-it-works" }}
            role="menuitem"
            onClick={onClose}
            className={`flex items-center gap-3 rounded-btn p-3 ${T.body} font-bold text-ink hover:bg-white ${FOCUS}`}
          >
            <span className="flex size-8 items-center justify-center rounded-badge border border-paper-line font-extrabold">
              ?
            </span>
            How it works
          </Link>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={handleSwitchPlayer}
          disabled={pending}
          className={`flex w-full items-center gap-3 rounded-btn p-3 ${T.body} font-bold text-ink transition hover:bg-white disabled:opacity-50 ${FOCUS}`}
        >
          <span className="flex size-8 items-center justify-center rounded-badge border border-paper-line">
            <LogOut className="size-4 stroke-ink stroke-2" />
          </span>
          Switch player
        </button>
      </div>
    </>
  );
}
