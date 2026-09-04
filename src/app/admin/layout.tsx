import type { ReactNode } from "react";
import { enforcePinResetGate } from "@/app/_lib/session-player";

// Forced-PIN-reset perimeter for every /admin route (issue #36). Kept here,
// not bolted onto each page, so a new /admin page can't forget it.
//
// enforcePinResetGate() redirects ONLY a session that is itself mid
// forced-reset; a stranger or a logged-out visitor falls through untouched
// and still gets each page's own requireAdmin() -> notFound() (bodyless
// 404, spec §4 rule 1 -- the surface must not announce itself).
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await enforcePinResetGate();
  return <>{children}</>;
}
