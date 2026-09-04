import "server-only";
import { cache } from "react";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// The admin authorization boundary. Every `/admin` page and every future
// `/api/admin/*` route calls `requireAdmin()` as its first line -- see
// docs/admin-ui-spec.md §4.
//
// Deliberately outside src/lib/** (alongside session-cookie.ts and csrf.ts):
// it's framework glue over a Supabase round-trip, not pure decision logic,
// so TESTING_STANDARD.md §1a's golden-value discipline doesn't apply. It
// still gets a committed branch test (admin-access.test.ts) because §1
// names admin actions explicitly.
//
// Wrapped in React `cache()` so a request that both renders the nav
// (getSessionIsAdmin, via the root layout) and hits an admin page
// (requireAdmin) does one player lookup, not two.

export interface AdminContext {
  playerId: string;
  competitionId: string;
}

/**
 * Resolves the current session to an admin context, or null.
 *
 * Returns null -- never throws, never redirects -- when there is no
 * session, the player row is missing, or the player is not an admin. The
 * caller decides what null means: an `/admin` page renders `notFound()`
 * (404, not 403 -- spec §4 rule 1, the surface must not announce itself),
 * an API route returns a bodyless 404.
 */
export const requireAdmin = cache(async (): Promise<AdminContext | null> => {
  const playerId = await getSessionPlayerId();
  if (!playerId) return null;

  const supabase = createServerSupabaseClient();
  // .order()/.limit(1) on a single-row select per AGENTS.md, even though
  // `id` is the primary key.
  const { data: player, error } = await supabase
    .from("players")
    .select("id, competition_id, is_admin")
    .eq("id", playerId)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!player || player.is_admin !== true) return null;

  return { playerId: player.id, competitionId: player.competition_id };
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
