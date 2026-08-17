import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recomputeMatchScores } from "@/lib/scoring/match";
import { writeScores } from "@/lib/scoring/write-scores";
import { isMatchVoided } from "@/lib/matches/voided";
import { isGameweekScoringComplete, toScoringSlot } from "./completion";
import { loadStandingsSnapshotInputs } from "@/lib/standings-snapshot/load-snapshot-inputs";
import { computeGameweekStandings } from "@/lib/standings-snapshot/compute-snapshot";
import { writeStandingsSnapshot } from "@/lib/standings-snapshot/write-snapshot";

interface GameweekRow {
  id: string;
  number: number;
  season_id: string;
  competition_id: string;
  match_1_id: string | null;
  match_2_id: string | null;
  match_1_voided_at: string | null;
  match_2_voided_at: string | null;
}

interface MatchRow {
  id: string;
  team_a_score: number | null;
  team_b_score: number | null;
  status: string;
}

/**
 * Production wiring for issue #21's scoring engine and issue #23's
 * standings snapshot -- issue #166. Called from `sync/matches`'s route
 * handler after it applies this cycle's match updates, with the ids of
 * whatever matches just landed a `status: "completed"` update.
 *
 * D1: no "newly completed" state tracking -- every call recomputes from
 * current DB state, safe only because `writeScores`/`writeStandingsSnapshot`
 * are both idempotent upserts (#21 D4, #23 D1). A match already scored last
 * cycle is a harmless repeat upsert; a corrected result is picked up
 * automatically the next time it appears in `completedMatchIds`.
 *
 * D2: only matches actually referenced by some gameweek's `match_1_id`/
 * `match_2_id` get scored -- `sync/matches` syncs the whole PL fixture
 * list, not just Tipped Matches, so most `completed` updates in a cycle are
 * untipped and irrelevant here.
 */
export async function scoreCompletedMatchesAndSnapshots(
  supabase: SupabaseClient,
  completedMatchIds: string[],
): Promise<void> {
  if (completedMatchIds.length === 0) return;

  const gameweekRows = await loadCandidateGameweeks(supabase, completedMatchIds);
  if (gameweekRows.length === 0) return;

  const referencedMatchIds = dedupe(
    gameweekRows.flatMap((gw) => [gw.match_1_id, gw.match_2_id]).filter(nonNull),
  );

  const { data: matchRows, error: matchesError } = await supabase
    .from("matches")
    .select("id, team_a_score, team_b_score, status")
    .in("id", referencedMatchIds);
  if (matchesError) throw matchesError;

  const matchById = new Map((matchRows ?? []).map((m: MatchRow) => [m.id, m]));

  const matchIdsToScore = referencedMatchIds.filter((id) =>
    completedMatchIds.includes(id),
  );

  const voidSignalsByMatchId = buildVoidSignalsByMatchId(gameweekRows);

  await Promise.all(
    matchIdsToScore.map((matchId) =>
      scoreOneMatch(
        supabase,
        matchId,
        matchById.get(matchId)!,
        voidSignalsByMatchId.get(matchId) ?? [],
      ),
    ),
  );

  const nowComplete = gameweekRows.filter((gw) => {
    const slot1 = toScoringSlot(gw.match_1_id, gw.match_1_voided_at, matchById);
    const slot2 = toScoringSlot(gw.match_2_id, gw.match_2_voided_at, matchById);
    return isGameweekScoringComplete(slot1, slot2);
  });

  await Promise.all(
    nowComplete.map((gw) => writeSnapshotForGameweek(supabase, gw)),
  );
}

async function loadCandidateGameweeks(
  supabase: SupabaseClient,
  completedMatchIds: string[],
): Promise<GameweekRow[]> {
  const GW_COLS =
    "id, number, season_id, competition_id, match_1_id, match_2_id, match_1_voided_at, match_2_voided_at";

  // D2 asks for one .or() query; this issues two .in() queries in parallel
  // and dedupes client-side instead -- same result set, avoids building a
  // hand-assembled PostgREST .or() filter string for what's otherwise a
  // plain .in() shape already used everywhere else in this module.
  const [byMatch1, byMatch2] = await Promise.all([
    supabase.from("gameweeks").select(GW_COLS).in("match_1_id", completedMatchIds),
    supabase.from("gameweeks").select(GW_COLS).in("match_2_id", completedMatchIds),
  ]);
  if (byMatch1.error) throw byMatch1.error;
  if (byMatch2.error) throw byMatch2.error;

  const byId = new Map<string, GameweekRow>();
  for (const row of [...(byMatch1.data ?? []), ...(byMatch2.data ?? [])]) {
    byId.set(row.id, row as GameweekRow);
  }
  return [...byId.values()];
}

/**
 * A match can be tipped by several competitions' gameweeks -- gather every
 * slot referencing each match for the voided signal (same shape as issue
 * #22's simulation driver), built once rather than re-filtered per match.
 */
function buildVoidSignalsByMatchId(
  gameweekRows: GameweekRow[],
): Map<string, { voidedAt: string | null }[]> {
  const byMatchId = new Map<string, { voidedAt: string | null }[]>();
  for (const gw of gameweekRows) {
    for (const [matchId, voidedAt] of [
      [gw.match_1_id, gw.match_1_voided_at],
      [gw.match_2_id, gw.match_2_voided_at],
    ] as const) {
      if (matchId === null) continue;
      const signals = byMatchId.get(matchId) ?? [];
      signals.push({ voidedAt });
      byMatchId.set(matchId, signals);
    }
  }
  return byMatchId;
}

async function scoreOneMatch(
  supabase: SupabaseClient,
  matchId: string,
  match: MatchRow,
  voidSignals: { voidedAt: string | null }[],
): Promise<void> {
  const { data: pickRows, error: picksError } = await supabase
    .from("picks")
    .select("player_id, pred_home_score, pred_away_score")
    .eq("match_id", matchId);
  if (picksError) throw picksError;

  const rows = recomputeMatchScores({
    matchId,
    result:
      match.team_a_score !== null && match.team_b_score !== null
        ? { home: match.team_a_score, away: match.team_b_score }
        : null,
    voided: isMatchVoided(voidSignals, match.status),
    picks: (pickRows ?? []).map((p) => ({
      playerId: p.player_id,
      pickHome: p.pred_home_score,
      pickAway: p.pred_away_score,
    })),
  });

  await writeScores(supabase, rows);
}

async function writeSnapshotForGameweek(
  supabase: SupabaseClient,
  gameweek: GameweekRow,
): Promise<void> {
  const inputs = await loadStandingsSnapshotInputs(
    supabase,
    gameweek.competition_id,
    gameweek.season_id,
    gameweek.number,
  );
  const rows = computeGameweekStandings({
    players: inputs.players,
    gameweekScoreRows: inputs.gameweekScoreRows,
    seasonScoreRows: inputs.seasonScoreRows,
  });
  await writeStandingsSnapshot(supabase, gameweek.id, rows);
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

function nonNull<T>(value: T | null): value is T {
  return value !== null;
}
