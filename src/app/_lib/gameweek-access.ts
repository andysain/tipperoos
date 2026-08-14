import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveCurrentGameweek,
  type CandidateGameweek,
  type GameweekSlot,
} from "@/lib/gameweeks/resolve";

// DB-fetching glue for the current-gameweek resolver -- deliberately outside
// src/lib/** (see table-prediction-access.ts for the same rationale: the
// golden-value discipline in TESTING_STANDARD.md targets pure decision
// logic, which already has its own tests in
// src/lib/gameweeks/resolve.test.ts; there's no meaningful golden value to
// assert on a Supabase round-trip itself).

function buildSlot(
  matchId: string | null,
  voidedAt: string | null,
  kickoffByMatchId: Map<string, string>,
): GameweekSlot {
  if (matchId === null) {
    return { matchId: null, kickoffTime: null, voidedAt: null };
  }
  const kickoffTime = kickoffByMatchId.get(matchId) ?? null;
  return {
    matchId,
    kickoffTime: kickoffTime ? new Date(kickoffTime) : null,
    voidedAt: voidedAt ? new Date(voidedAt) : null,
  };
}

/**
 * The current season's id (the one row with `is_current = true`). Shared by
 * every Pick Board loader so a request resolves it once instead of once per
 * loader -- see docs/standards/PERFORMANCE_TESTING_STANDARD.md §4.1.
 */
export async function getCurrentSeasonId(
  supabase: SupabaseClient,
): Promise<string | null> {
  // .order() is required even for a single expected row -- AGENTS.md:
  // "Never select a row without an explicit .order()... Postgres row order
  // is arbitrary." start_date desc is the meaningful tiebreak if `is_current`
  // were ever momentarily true on more than one row during a season rollover.
  const { data: season, error } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .order("start_date", { ascending: false })
    .maybeSingle();
  if (error) throw error;
  return season?.id ?? null;
}

/**
 * Loads this competition's gameweeks for the current season and resolves
 * which one is current, per docs/adr/0007-home-surface-and-pick-entry.md.
 * Null if the season hasn't been seeded, or no gameweek has ever had a
 * Tipped Match (e.g. before gameweek 1's seed script has run).
 *
 * `seasonId` is a required caller-supplied id, not resolved internally --
 * callers that already know it (the Pick Board route resolves it once up
 * front) skip a redundant `seasons` round trip by passing it straight
 * through.
 */
export async function resolveCurrentGameweekForCompetition(
  supabase: SupabaseClient,
  competitionId: string,
  now: Date,
  seasonId: string,
): Promise<number | null> {
  const { data: gameweeks, error: gameweeksError } = await supabase
    .from("gameweeks")
    .select(
      "number, match_1_id, match_2_id, match_1_voided_at, match_2_voided_at",
    )
    .eq("season_id", seasonId)
    .eq("competition_id", competitionId)
    .order("number", { ascending: true });
  if (gameweeksError) throw gameweeksError;
  if (!gameweeks || gameweeks.length === 0) return null;

  const matchIds = Array.from(
    new Set(
      gameweeks
        .flatMap((gw) => [gw.match_1_id, gw.match_2_id])
        .filter((id): id is string => id !== null),
    ),
  );

  const kickoffByMatchId = new Map<string, string>();
  if (matchIds.length > 0) {
    const { data: matches, error: matchesError } = await supabase
      .from("matches")
      .select("id, kickoff_time")
      .in("id", matchIds);
    if (matchesError) throw matchesError;
    for (const match of matches ?? []) {
      kickoffByMatchId.set(match.id, match.kickoff_time);
    }
  }

  const candidates: CandidateGameweek[] = gameweeks.map((gw) => ({
    number: gw.number,
    match1: buildSlot(gw.match_1_id, gw.match_1_voided_at, kickoffByMatchId),
    match2: buildSlot(gw.match_2_id, gw.match_2_voided_at, kickoffByMatchId),
  }));

  return resolveCurrentGameweek(candidates, now);
}
