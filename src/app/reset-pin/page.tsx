import { redirect } from "next/navigation";
import { loadSessionPlayerRow } from "@/app/_lib/session-player";
import { ResetPinForm } from "./ResetPinForm";

// The forced-PIN-reset screen (issue #36). A player is sent here by
// loadActivePlayer() (src/app/_lib/session-player.ts) whenever their row
// carries pin_reset_required; every other authenticated route bounces back
// here until they set a real PIN. The app chrome is suppressed for this
// path in AppShell.
//
// It reads loadSessionPlayerRow() directly rather than loadActivePlayer() --
// that helper redirects *to here*, so calling it would loop. Using the same
// cached funnel keeps the "one players lookup per request" invariant true.
export const dynamic = "force-dynamic";

export default async function ResetPinPage() {
  const player = await loadSessionPlayerRow();

  if (!player) redirect("/login");
  // No reset pending -- nothing to do here; don't strand the player on a
  // screen that would 403 on submit.
  if (!player.pinResetRequired) redirect("/");

  return <ResetPinForm />;
}
