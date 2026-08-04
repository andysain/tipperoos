"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Top-corner affordance, not a tab-bar slot (docs/adr/0004-app-navigation-shell.md
// -- it's an action, not a destination). Always performs a full route
// navigation to /login, never an in-place auth swap: that unmounts the
// entire route tree, which is what destroys any in-progress client state
// (e.g. Predict the Table's picker selection) for a shared-device switch --
// no explicit reset plumbing needed.
export function SwitchPlayerButton() {
  const router = useRouter();
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
      router.push("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={handleSwitchPlayer}
      disabled={pending}
      aria-label="Switch player"
      title="Switch player"
      className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] right-3 z-10 flex size-10 items-center justify-center rounded-badge border border-paper-line bg-paper text-ink transition disabled:opacity-50"
    >
      <LogOut className="size-5 stroke-ink stroke-2" />
    </button>
  );
}
