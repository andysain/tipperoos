import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentSeasonId } from "@/app/_lib/gameweek-access";
import { loadLeaderboard } from "@/app/_lib/leaderboard-access";
import { formatWrapText, nameOf } from "@/lib/leaderboard/wrap-copy";

// The /admin index's Gameweek wrap panel (#219). Reuses the leaderboard's
// own loader rather than a second copy of its orchestration (#219 L3), and
// hands the page strings only: the panel never receives the wrap object or
// any pick data (L7).

export type AdminWrap =
  | { kind: "none" }
  | {
      kind: "ready";
      gameweekNumber: number;
      /** Exactly what "Copy as text" puts on the clipboard. */
      text: string;
      /** Award kinds fired, as the Season card counts them. */
      awardCount: number;
      /** Display names, alphabetical; never part of `text` (#219 P2). */
      noPicks: string[];
    };

/**
 * Serial Supabase depth 1 + 5 = 6 (getCurrentSeasonId, then
 * loadLeaderboard). The page runs it alongside its counts -> health chain,
 * which is also 6, so /admin's depth doesn't grow. The season id is read
 * again rather than awaited from loadAdminIndexCounts, which only returns
 * it at the end of its own chain.
 */
export async function loadAdminWrap(
  supabase: SupabaseClient,
  competitionId: string,
  viewerId: string,
): Promise<AdminWrap> {
  const seasonId = await getCurrentSeasonId(supabase);
  if (seasonId === null) return { kind: "none" };

  const view = await loadLeaderboard(
    supabase,
    competitionId,
    seasonId,
    viewerId,
  );
  if (view.wrap === null) return { kind: "none" };

  const people = Object.fromEntries(
    view.rows.map((row) => [
      row.playerId,
      { displayName: row.displayName, emoji: row.emoji },
    ]),
  );
  return {
    kind: "ready",
    gameweekNumber: view.wrap.gameweekNumber,
    text: formatWrapText(view.wrap, people),
    awardCount: view.wrap.fired.length,
    noPicks: (view.noPicks ?? [])
      .map((id) => nameOf(people, id))
      .sort((a, b) => a.localeCompare(b)),
  };
}
