import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// The single per-request "resolve the session to its player row" funnel.
//
// Before this existed, every protected page rolled its own
// getSessionPlayerId() + bespoke `players` select, and *nothing* on the
// server enforced pin_reset_required -- the login route issued a valid
// session cookie before the flag was ever considered, so the forced-PIN
// reset screen was bypassable by typing a URL (issue #36).
//
// `loadSessionPlayerRow()` is the chokepoint: one `players` read, React
// `cache()`-wrapped so the root layout's admin check (getSessionIsAdmin ->
// requireAdmin) and a page's loadActivePlayer() share a single round trip.
// requireAdmin() is built on it too -- which is what puts /admin inside the
// forced-reset perimeter rather than being a silent exception.

export interface SessionPlayerRow {
  id: string;
  competitionId: string;
  isAdmin: boolean;
  pinResetRequired: boolean;
}

/**
 * The session player's row, or null when there is no session or the row is
 * gone. A stateless signed cookie naming a deleted player (or one minted
 * against another environment) is an expected shape of input, not a failure
 * -- see resolveCompetitionId's note in src/lib/competitions/scope.ts. A
 * genuine query error still throws.
 *
 * Returns null *before* opening a Supabase client when there's no session,
 * so a logged-out request costs no query (admin-access.test.ts asserts this
 * for requireAdmin, which now flows through here).
 */
export const loadSessionPlayerRow = cache(
  async (): Promise<SessionPlayerRow | null> => {
    const playerId = await getSessionPlayerId();
    if (!playerId) return null;

    const supabase = createServerSupabaseClient();
    // .order()/.limit(1) on a single-row select per AGENTS.md, even though
    // `id` is the primary key.
    const { data: player, error } = await supabase
      .from("players")
      .select("id, competition_id, is_admin, pin_reset_required")
      .eq("id", playerId)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!player) return null;

    return {
      id: player.id,
      competitionId: player.competition_id,
      isAdmin: player.is_admin === true,
      pinResetRequired: player.pin_reset_required === true,
    };
  },
);

export interface ActivePlayer {
  playerId: string;
  competitionId: string;
}

/**
 * The forced-reset gate. **Every protected page calls this as its first
 * `await`, before its own loaders.** Redirects a logged-out visitor to
 * /login and a player mid forced-PIN-reset to /reset-pin; otherwise returns
 * the ids the page needs for competition scoping.
 *
 * Do NOT call this from /reset-pin or /login -- this helper redirects *to*
 * /reset-pin, so calling it there would loop. Those routes run their own
 * lighter session/flag checks.
 */
export async function loadActivePlayer(): Promise<ActivePlayer> {
  const player = await loadSessionPlayerRow();
  if (!player) redirect("/login");
  if (player.pinResetRequired) redirect("/reset-pin");
  return { playerId: player.id, competitionId: player.competitionId };
}

/**
 * The forced-reset gate for surfaces that must stay a bodyless 404 for a
 * stranger and so can't use loadActivePlayer() (it redirects logged-out
 * visitors to /login, which would announce the surface -- admin-ui-spec.md
 * §4 rule 1). Redirects to /reset-pin *only* when there is a session whose
 * player is mid forced-reset; a logged-out or row-less request is left for
 * the caller's own 404 path. Used by src/app/admin/layout.tsx.
 */
export async function enforcePinResetGate(): Promise<void> {
  const player = await loadSessionPlayerRow();
  if (player?.pinResetRequired) redirect("/reset-pin");
}
