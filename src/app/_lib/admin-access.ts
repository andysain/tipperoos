import "server-only";
import { cache } from "react";
import { loadSessionPlayerRow } from "@/app/_lib/session-player";

// The admin authorization boundary. Every `/admin` page and every
// `/api/admin/*` route calls `requireAdmin()` as its first line -- see
// docs/admin-ui-spec.md §4.
//
// Deliberately outside src/lib/** (alongside session-cookie.ts and csrf.ts):
// it's framework glue over a Supabase round-trip, not pure decision logic,
// so TESTING_STANDARD.md §1a's golden-value discipline doesn't apply. It
// still gets a committed branch test (admin-access.test.ts) because §1
// names admin actions explicitly.
//
// The `players` read itself now lives in loadSessionPlayerRow()
// (session-player.ts), shared -- React cache()-wrapped -- with the root
// layout's nav check and each page's loadActivePlayer() gate, so one
// request does one player lookup. A flagged admin is therefore redirected
// to /reset-pin from /admin too, not just from `/`.

export interface AdminContext {
  playerId: string;
  competitionId: string;
}

/**
 * Resolves the current session to an admin context, or null.
 *
 * Returns null -- never throws for an auth reason, never redirects -- when
 * there is no session, the player row is missing, or the player is not an
 * admin. The caller decides what null means: an `/admin` page renders
 * `notFound()` (404, not 403 -- spec §4 rule 1, the surface must not
 * announce itself), an API route returns a bodyless 404.
 */
export const requireAdmin = cache(async (): Promise<AdminContext | null> => {
  const player = await loadSessionPlayerRow();
  if (!player || !player.isAdmin) return null;
  return { playerId: player.id, competitionId: player.competitionId };
});

/**
 * A render-only boolean for the nav: true when the session player is an
 * admin. Grants nothing on its own (spec §4 rule 5) -- the server-side
 * `requireAdmin()` is the only gate. Used by the root layout to decide
 * whether the More menu shows the "Competition admin" entry.
 */
export const getSessionIsAdmin = cache(async (): Promise<boolean> => {
  return (await requireAdmin()) !== null;
});
