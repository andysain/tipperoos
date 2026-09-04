import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCurrentSeasonId,
  resolveCurrentGameweekForCompetition,
} from "@/app/_lib/gameweek-access";

// DB-fetching glue for the /admin index counts row (docs/admin-ui-spec.md
// §5). Outside src/lib/** for the same reason as the sibling *-access.ts
// files: there's no meaningful golden value to assert on a Supabase
// round-trip. The two derivations that ARE non-obvious -- the Predict the
// Table buckets and the current-gameweek pick buckets -- are pulled out as
// pure functions below and unit-tested directly.
//
// Every query is scoped to the caller's own competition_id (AGENTS.md:38,
// docs/adr/0004) -- filter, never aggregate; more than one `competitions`
// row can exist on a project. The `disabled` sub-count named in spec §5 is
// intentionally absent here: no `disabled_at` column exists until the
// Phase 3 migration.

export interface GameweekPickBuckets {
  /** Non-null tipped-match slots this gameweek: 2 normally, 1 with a Skipped Slot. */
  tippedMatchCount: number;
  /** Non-bot players with a pick for none of the tipped matches. */
  noTips: number;
  /** Non-bot players with a pick for exactly one (only reachable when tippedMatchCount is 2). */
  oneTip: number;
  /** Non-bot players with a pick for every tipped match. */
  allTips: number;
}

export interface AdminIndexCounts {
  playersTotal: number;
  botsTotal: number;
  /** Null before gameweek 1 is seeded (no season, or no tipped match yet). */
  currentGameweek: number | null;
  /** Null when there's no current gameweek, or it has no tipped matches. */
  currentGameweekPicks: GameweekPickBuckets | null;
  tablePredictions: {
    submitted: number;
    skipped: number;
    /** Non-bot players with neither a submitted nor a skipped prediction. */
    outstanding: number;
  };
}

interface TablePredictionRow {
  is_skipped: boolean | null;
  submitted_at: string | null;
}

/**
 * submitted / skipped / outstanding over non-bot players. A skipped row wins
 * over a submitted timestamp; a row with neither (a partially-filled draft)
 * counts as outstanding, same as a player with no row at all.
 */
export function bucketTablePredictions(
  humanCount: number,
  rows: TablePredictionRow[],
): { submitted: number; skipped: number; outstanding: number } {
  let submitted = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.is_skipped === true) {
      skipped += 1;
    } else if (row.submitted_at !== null) {
      submitted += 1;
    }
  }
  return {
    submitted,
    skipped,
    outstanding: Math.max(0, humanCount - submitted - skipped),
  };
}

/**
 * How many non-bot players have tipped none / some / all of this gameweek's
 * tipped matches. `pickRows` is one row per (player, tipped match) that has a
 * pick -- already scoped to the tipped matches and to non-bot players in this
 * competition. `oneTip` is only ever non-zero when there are two tipped
 * matches (a Skipped-Slot week has one, so a player either has it or not).
 */
export function bucketGameweekPicks(
  humanPlayerIds: string[],
  pickRows: { player_id: string }[],
  tippedMatchCount: number,
): GameweekPickBuckets {
  const countByPlayer = new Map<string, number>();
  for (const row of pickRows) {
    countByPlayer.set(
      row.player_id,
      (countByPlayer.get(row.player_id) ?? 0) + 1,
    );
  }

  let noTips = 0;
  let oneTip = 0;
  let allTips = 0;
  for (const id of humanPlayerIds) {
    const filed = Math.min(countByPlayer.get(id) ?? 0, tippedMatchCount);
    if (filed === 0) {
      noTips += 1;
    } else if (filed >= tippedMatchCount) {
      allTips += 1;
    } else {
      oneTip += 1;
    }
  }
  return { tippedMatchCount, noTips, oneTip, allTips };
}

async function loadCurrentGameweekPicks(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  gameweekNumber: number,
  humanPlayerIds: string[],
): Promise<GameweekPickBuckets | null> {
  const { data: gameweek, error } = await supabase
    .from("gameweeks")
    .select("match_1_id, match_2_id")
    .eq("season_id", seasonId)
    .eq("competition_id", competitionId)
    .eq("number", gameweekNumber)
    .order("number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!gameweek) return null;

  const tippedMatchIds = [gameweek.match_1_id, gameweek.match_2_id].filter(
    (id): id is string => id !== null,
  );
  if (tippedMatchIds.length === 0) return null;

  const { data: picks, error: picksError } = await supabase
    .from("picks")
    .select("player_id, players!inner(competition_id, is_bot)")
    .in("match_id", tippedMatchIds)
    .eq("players.competition_id", competitionId)
    .eq("players.is_bot", false)
    .order("player_id", { ascending: true });
  if (picksError) throw picksError;

  return bucketGameweekPicks(
    humanPlayerIds,
    picks ?? [],
    tippedMatchIds.length,
  );
}

export async function loadAdminIndexCounts(
  supabase: SupabaseClient,
  competitionId: string,
): Promise<AdminIndexCounts> {
  // The three reads are independent -- one wave, not a chain
  // (PERFORMANCE_TESTING_STANDARD.md §4 item 1). Only the gameweek resolve
  // below depends on the season id.
  const [playersResult, predictionsResult, seasonId] = await Promise.all([
    supabase
      .from("players")
      .select("id, is_bot")
      .eq("competition_id", competitionId)
      .order("id", { ascending: true }),
    // table_predictions has no competition_id -- scope via an inner join on
    // players, and drop bots (Predict the Table is human onboarding).
    supabase
      .from("table_predictions")
      .select(
        "player_id, is_skipped, submitted_at, players!inner(competition_id, is_bot)",
      )
      .eq("players.competition_id", competitionId)
      .eq("players.is_bot", false)
      .order("player_id", { ascending: true }),
    getCurrentSeasonId(supabase),
  ]);

  if (playersResult.error) throw playersResult.error;
  if (predictionsResult.error) throw predictionsResult.error;

  const roster = playersResult.data ?? [];
  const playersTotal = roster.length;
  const botsTotal = roster.filter((p) => p.is_bot === true).length;
  const humanPlayerIds = roster
    .filter((p) => p.is_bot !== true)
    .map((p) => p.id as string);

  const tablePredictions = bucketTablePredictions(
    humanPlayerIds.length,
    predictionsResult.data ?? [],
  );

  const currentGameweek = seasonId
    ? await resolveCurrentGameweekForCompetition(
        supabase,
        competitionId,
        new Date(),
        seasonId,
      )
    : null;

  const currentGameweekPicks =
    seasonId && currentGameweek !== null
      ? await loadCurrentGameweekPicks(
          supabase,
          competitionId,
          seasonId,
          currentGameweek,
          humanPlayerIds,
        )
      : null;

  return {
    playersTotal,
    botsTotal,
    currentGameweek,
    currentGameweekPicks,
    tablePredictions,
  };
}
