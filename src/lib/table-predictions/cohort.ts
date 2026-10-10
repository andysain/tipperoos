import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TOTAL_TEAMS,
  scorePredictTableCohort,
  type CohortEntry,
  type PredictTableScoreResult,
  type TeamId,
} from "@/lib/scoring/predict-table";
import { BAND_KEYS, isBandKey, isLateJoiner } from "./rules";

// The read-and-score half of the Predict the Table cohort (issue #214 D1),
// shared by the recompute (which writes the results) and the comparison
// page (which renders them). Sharing it is what guarantees the two agree on
// the cohort -- non-bot players in this competition with a submitted,
// non-skipped table, Late Joiners outside the Bold Call process -- so the
// page's totals match the leaderboard's stored ones (issue D3).
//
// One round trip: two independent reads in one wave, each a single
// PostgREST query thanks to embedded resources -- predictions carry their
// player and ranks; the current season carries its standings and its
// earliest match (Gameweek 1's kickoff). The recompute's previous shape was
// six serial reads. The season is the newest flagged current, as before, so
// a stray second current season (staging once had one) can't mix seasons.

export interface CohortPlayer {
  id: string;
  displayName: string;
  emoji: string | null;
  isLateJoiner: boolean;
}

export interface ScoredCohort {
  /** Members only: their table is submitted and not skipped. */
  players: Map<string, CohortPlayer>;
  /** Member id -> team -> predicted Band index (0-7). */
  bands: Map<string, Map<TeamId, number>>;
  /** Member id -> complete score. Empty until `actualOrder` is complete. */
  results: Map<string, PredictTableScoreResult>;
  /** The current standings, index 0 = 1st; empty unless all 20 exist. */
  actualOrder: TeamId[];
  /** The fewest matches any club has played; null with no standings. */
  minPlayed: number | null;
  /** When the standings last changed; null with no standings. */
  standingsUpdatedAt: Date | null;
  gameweekOneKickoff: Date | null;
}

interface PredictionRow {
  id: string;
  player_id: string;
  submitted_at: string | null;
  is_skipped: boolean;
  players: {
    id: string;
    display_name: string;
    emoji: string | null;
    joined_at: string;
  } | null;
  table_prediction_ranks: { team_id: string; band: string }[] | null;
}

interface SeasonRow {
  id: string;
  team_standings:
    | {
        team_id: string;
        position: number;
        played: number;
        updated_at: string;
      }[]
    | null;
  matches: { kickoff_time: string }[] | null;
}

/**
 * A table counts -- for scoring, for the leaderboard, for being visible --
 * only once it is submitted and not skipped. Every Band move before the
 * deadline resets `submitted_at`, and skipping sets `is_skipped`, so a
 * stored score can outlive the table it was earned by (issue #214 D2).
 */
export function isSubmittedTable(row: {
  submitted_at: string | null;
  is_skipped: boolean;
}): boolean {
  return row.submitted_at !== null && !row.is_skipped;
}

const bandIndexByKey = new Map(BAND_KEYS.map((key, index) => [key, index]));

export async function loadScoredCohort(
  supabase: SupabaseClient,
  competitionId: string,
): Promise<ScoredCohort> {
  const [predictionsResult, seasonResult] = await Promise.all([
    supabase
      .from("table_predictions")
      .select(
        "id, player_id, submitted_at, is_skipped, players!inner(id, display_name, emoji, joined_at, competition_id, is_bot), table_prediction_ranks(team_id, band)",
      )
      .eq("players.competition_id", competitionId)
      .eq("players.is_bot", false)
      .order("id"),
    // The current season -- the newest one, deterministically, exactly as
    // the recompute always chose it -- carrying its standings in table
    // order and its earliest match (Gameweek 1's kickoff), in one query.
    supabase
      .from("seasons")
      .select(
        "id, team_standings(team_id, position, played, updated_at), matches(kickoff_time)",
      )
      .eq("is_current", true)
      .order("start_date", { ascending: false })
      .order("position", {
        ascending: true,
        referencedTable: "team_standings",
      })
      .order("kickoff_time", { ascending: true, referencedTable: "matches" })
      .limit(1, { referencedTable: "matches" })
      .limit(1)
      .maybeSingle(),
  ]);
  if (predictionsResult.error) throw predictionsResult.error;
  if (seasonResult.error) throw seasonResult.error;

  const season = seasonResult.data as unknown as SeasonRow | null;
  const firstMatch = season?.matches?.[0];
  const gameweekOneKickoff = firstMatch
    ? new Date(firstMatch.kickoff_time)
    : null;

  const players = new Map<string, CohortPlayer>();
  const bands = new Map<string, Map<TeamId, number>>();
  // supabase-js types a `!inner` embed as an array; PostgREST returns the
  // single parent row for this many-to-one relation.
  for (const row of (predictionsResult.data ??
    []) as unknown as PredictionRow[]) {
    if (!isSubmittedTable(row) || !row.players) continue;
    const joined = new Date(row.players.joined_at);
    players.set(row.player_id, {
      id: row.player_id,
      displayName: row.players.display_name,
      emoji: row.players.emoji,
      isLateJoiner: isLateJoiner(joined, gameweekOneKickoff),
    });
    const bandMap = new Map<TeamId, number>();
    for (const rank of row.table_prediction_ranks ?? []) {
      if (!isBandKey(rank.band)) continue;
      const index = bandIndexByKey.get(rank.band);
      if (index !== undefined) bandMap.set(rank.team_id, index);
    }
    bands.set(row.player_id, bandMap);
  }

  const standings = season?.team_standings ?? [];
  const actualOrder =
    standings.length === TOTAL_TEAMS ? standings.map((s) => s.team_id) : [];
  const minPlayed =
    standings.length > 0 ? Math.min(...standings.map((s) => s.played)) : null;
  const latest = standings.reduce<string | null>(
    (max, s) => (max === null || s.updated_at > max ? s.updated_at : max),
    null,
  );

  const entries: CohortEntry<string>[] = [...players.values()].map((p) => ({
    key: p.id,
    bands: bands.get(p.id) ?? new Map(),
    boldCallEligible: !p.isLateJoiner,
  }));
  const results =
    actualOrder.length === TOTAL_TEAMS && entries.length > 0
      ? scorePredictTableCohort(entries, actualOrder)
      : new Map<string, PredictTableScoreResult>();

  return {
    players,
    bands,
    results,
    actualOrder,
    minPlayed,
    standingsUpdatedAt: latest ? new Date(latest) : null,
    gameweekOneKickoff,
  };
}
