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
 * Loads this competition's gameweeks for the current season and resolves
 * which one is current, per docs/adr/0007-home-surface-and-pick-entry.md.
 * Null if the season hasn't been seeded, or no gameweek has ever had a
 * Tipped Match (e.g. before gameweek 1's seed script has run).
 */
export async function resolveCurrentGameweekForCompetition(
  supabase: SupabaseClient,
  competitionId: string,
  now: Date,
): Promise<number | null> {
  const { data: season, error: seasonError } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();
  if (seasonError) throw seasonError;
  if (!season) return null;

  const { data: gameweeks, error: gameweeksError } = await supabase
    .from("gameweeks")
    .select(
      "number, match_1_id, match_2_id, match_1_voided_at, match_2_voided_at",
    )
    .eq("season_id", season.id)
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
