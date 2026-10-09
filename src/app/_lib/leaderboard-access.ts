import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoresForCompetition } from "@/lib/competitions/scope";
import {
  buildLeaderboard,
  type LeaderboardRow,
  type ScoredGameweek,
} from "@/lib/leaderboard/board";
import {
  chunkForRowCap,
  computeStreaks,
  countsTowardStreak,
  SUPABASE_MAX_ROWS,
  type StreakPick,
} from "@/lib/leaderboard/streaks";
import { isMatchVoided } from "@/lib/matches/voided";
import {
  buildGameweekWrap,
  type GameweekWrap,
  type WrapMatch,
  type WrapSnapshotRow,
} from "@/lib/leaderboard/wrap";

// DB-fetching glue for the leaderboard route (issue #24) -- outside
// src/lib/** for the same reason as pick-board-access.ts: plain scoped
// Supabase round-trips, with every decision that's worth golden-value
// testing pushed into src/lib/leaderboard/board.ts instead.
//
// Every read here is competition-scoped. `scores` is reached only through
// `scoresForCompetition`, never by match_id alone (AGENTS.md), and the
// gameweek and snapshot reads both filter on competition_id + season_id.

/**
 * Gameweeks that have been scored, with the earliest kickoff among their
 * Tipped Matches -- the denominator input for points-per-gameweek-played
 * (ADR 0012 D3).
 *
 * "Scored" is defined as "has standings_snapshots rows", matching how #23's
 * writer runs: the snapshot is written when a gameweek completes, so its
 * presence is the existing signal for a finished, scored gameweek. Deriving
 * it from `scores` instead would count a gameweek as scored the moment its
 * first match result landed, mid-round.
 */
export async function loadScoredGameweeks(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
): Promise<ScoredGameweek[]> {
  const { data: gameweekRows, error: gameweeksError } = await supabase
    .from("gameweeks")
    .select("id, number, match_1_id, match_2_id")
    .eq("competition_id", competitionId)
    .eq("season_id", seasonId)
    .order("number", { ascending: true });
  if (gameweeksError) throw gameweeksError;

  const gameweeks = gameweekRows ?? [];
  if (gameweeks.length === 0) return [];

  const { data: snapshotRows, error: snapshotError } = await supabase
    .from("standings_snapshots")
    .select("gameweek_id")
    .in(
      "gameweek_id",
      gameweeks.map((gw) => gw.id),
    );
  if (snapshotError) throw snapshotError;

  const scoredGameweekIds = new Set(
    (snapshotRows ?? []).map((row) => row.gameweek_id),
  );
  const scored = gameweeks.filter((gw) => scoredGameweekIds.has(gw.id));
  if (scored.length === 0) return [];

  const matchIds = scored
    .flatMap((gw) => [gw.match_1_id, gw.match_2_id])
    .filter((id): id is string => id !== null);
  if (matchIds.length === 0) return [];

  const { data: matchRows, error: matchesError } = await supabase
    .from("matches")
    .select("id, kickoff_time")
    .in("id", matchIds);
  if (matchesError) throw matchesError;

  const kickoffById = new Map(
    (matchRows ?? []).map((row) => [row.id, row.kickoff_time as string]),
  );

  return scored.flatMap((gw) => {
    // A Skipped Slot leaves a null match id and contributes no kickoff; a
    // gameweek where both slots were skipped has no kickoff at all and so
    // can't be attributed to anyone's joined_at -- drop it rather than
    // guess a boundary.
    const kickoffs = [gw.match_1_id, gw.match_2_id]
      .filter((id): id is string => id !== null)
      .map((id) => kickoffById.get(id))
      .filter((k): k is string => k !== undefined)
      .sort();
    if (kickoffs.length === 0) return [];
    return [{ number: gw.number, earliestKickoffUtcIso: kickoffs[0] }];
  });
}

/**
 * Stored snapshot rows for the given gameweek numbers -- N-1 for the
 * list's movement (ADR 0012 D2), and N plus N-1 for the Gameweek wrap
 * (#218 L11). Totals are re-ranked by the caller rather than read as
 * `season_standing`, which is bot-inclusive by design (#23 D3), so diffing
 * a humans-only rank against it would be wrong for every player below a
 * bot. Two round trips; at most (numbers x roster) rows, far under the
 * row cap.
 */
export async function loadSnapshotTotals(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  gameweekNumbers: readonly number[],
): Promise<Map<number, WrapSnapshotRow[]>> {
  const wanted = gameweekNumbers.filter((n) => n >= 1);
  const byNumber = new Map<number, WrapSnapshotRow[]>();
  if (wanted.length === 0) return byNumber;

  const { data: gameweeks, error: gameweekError } = await supabase
    .from("gameweeks")
    .select("id, number")
    .eq("competition_id", competitionId)
    .eq("season_id", seasonId)
    .in("number", wanted)
    .order("number", { ascending: true });
  if (gameweekError) throw gameweekError;
  if (!gameweeks || gameweeks.length === 0) return byNumber;

  const numberById = new Map(gameweeks.map((gw) => [gw.id, gw.number]));
  const { data, error } = await supabase
    .from("standings_snapshots")
    .select("gameweek_id, player_id, gameweek_score, season_total")
    .in("gameweek_id", [...numberById.keys()])
    .order("gameweek_id", { ascending: true })
    .order("player_id", { ascending: true });
  if (error) throw error;

  for (const row of data ?? []) {
    const number = numberById.get(row.gameweek_id);
    if (number === undefined) continue;
    const rows = byNumber.get(number) ?? [];
    rows.push({
      playerId: row.player_id,
      gameweekScore: row.gameweek_score,
      seasonTotal: row.season_total,
    });
    byNumber.set(number, rows);
  }
  return byNumber;
}

/**
 * Every Tipped Match in this competition's season, in the shape
 * `computeStreaks` folds (issue #217). Deliberately NOT bounded to scored
 * (snapshotted) gameweeks the way `loadScoredGameweeks` is: the streak
 * updates as each match gets its final score, mid-gameweek included (#217
 * D5). Two round trips: gameweeks (scoped by competition + season), then
 * their matches by id -- a fixture is global, so the scope comes from the
 * gameweek read.
 */
export async function loadTippedMatches(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
): Promise<WrapMatch[]> {
  const { data: gameweekRows, error: gameweeksError } = await supabase
    .from("gameweeks")
    .select(
      "number, match_1_id, match_2_id, match_1_voided_at, match_2_voided_at",
    )
    .eq("competition_id", competitionId)
    .eq("season_id", seasonId)
    .order("number", { ascending: true });
  if (gameweeksError) throw gameweeksError;

  // Every slot referencing a match, for isMatchVoided. A Skipped Slot (null
  // match id) has no match and isn't part of the sequence. The gameweek
  // number lets the Gameweek wrap bound streaks to "through N" (#218 L9).
  const slotsByMatchId = new Map<string, { voidedAt: string | null }[]>();
  const gameweekByMatchId = new Map<string, number>();
  for (const gw of gameweekRows ?? []) {
    for (const [matchId, voidedAt] of [
      [gw.match_1_id, gw.match_1_voided_at],
      [gw.match_2_id, gw.match_2_voided_at],
    ] as const) {
      if (matchId === null) continue;
      const slots = slotsByMatchId.get(matchId) ?? [];
      slots.push({ voidedAt });
      slotsByMatchId.set(matchId, slots);
      if (!gameweekByMatchId.has(matchId)) {
        gameweekByMatchId.set(matchId, gw.number);
      }
    }
  }
  if (slotsByMatchId.size === 0) return [];

  const { data: matchRows, error: matchesError } = await supabase
    .from("matches")
    .select(
      "id, kickoff_time, provider_match_id, status, team_a_score, team_b_score, " +
        "team_a:teams!matches_team_a_id_fkey(name), " +
        "team_b:teams!matches_team_b_id_fkey(name)",
    )
    .in("id", [...slotsByMatchId.keys()])
    .order("kickoff_time", { ascending: true })
    .order("id", { ascending: true });
  if (matchesError) throw matchesError;

  // Every id was read from a gameweek slot above, so its number is always
  // known; a row without one is skipped rather than given a stand-in that
  // would count as "through any N".
  type Row = {
    id: string;
    kickoff_time: string;
    provider_match_id: string;
    status: string;
    team_a_score: number | null;
    team_b_score: number | null;
    team_a: { name: string } | null;
    team_b: { name: string } | null;
  };
  return ((matchRows ?? []) as unknown as Row[]).flatMap((row) => {
    const gameweekNumber = gameweekByMatchId.get(row.id);
    if (gameweekNumber === undefined) return [];
    return [
      {
        id: row.id,
        gameweekNumber,
        kickoffUtcIso: row.kickoff_time,
        providerMatchId: row.provider_match_id,
        homeTeam: row.team_a?.name ?? "—",
        awayTeam: row.team_b?.name ?? "—",
        // A final result needs `completed` AND both scores -- a completed match
        // whose score hasn't landed is skipped, not counted as a miss (#217 L5).
        result:
          row.status === "completed" &&
          row.team_a_score !== null &&
          row.team_b_score !== null
            ? { home: row.team_a_score, away: row.team_b_score }
            : null,
        voided: isMatchVoided(slotsByMatchId.get(row.id) ?? [], row.status),
      },
    ];
  });
}

/**
 * Human picks on the given matches, competition-scoped through
 * `players!inner` -- never by match_id alone, since another competition may
 * have tipped the same fixture (AGENTS.md, ADR 0004).
 *
 * A season of picks (~76 matches x roster) passes Supabase's silent
 * `max_rows = 1000` cap, so the read is split by `chunkForRowCap` and issued
 * as one parallel wave -- serial depth 1 regardless of chunk count. A chunk
 * that still comes back at the cap throws rather than truncating.
 */
export async function loadStreakPicks(
  supabase: SupabaseClient,
  competitionId: string,
  matchIds: readonly string[],
  humanCount: number,
): Promise<StreakPick[]> {
  const chunks = chunkForRowCap(matchIds, humanCount);
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("picks")
        .select(
          "player_id, match_id, pred_home_score, pred_away_score, players!inner(competition_id, is_bot)",
        )
        .in("match_id", chunk)
        .eq("players.competition_id", competitionId)
        .eq("players.is_bot", false)
        .order("match_id", { ascending: true })
        .order("player_id", { ascending: true }),
    ),
  );

  return results.flatMap(({ data, error }) => {
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length >= SUPABASE_MAX_ROWS) {
      throw new Error(
        `loadStreakPicks: a chunk returned ${rows.length} rows, at Supabase's max_rows cap -- picks would be silently truncated`,
      );
    }
    return rows.map((row) => ({
      playerId: row.player_id,
      matchId: row.match_id,
      home: row.pred_home_score,
      away: row.pred_away_score,
    }));
  });
}

export interface LeaderboardView {
  rows: LeaderboardRow[];
  /** The last snapshotted gameweek's awards (#218); null before any. */
  wrap: GameweekWrap | null;
  /** False before the competition's first scored match -- ADR 0012 D8. */
  scored: boolean;
}

/**
 * Serial Supabase depth 5, counted in round trips: wave 1 is
 * max(scoresForCompetition 2, loadScoredGameweeks 3, loadTippedMatches 2) =
 * 3; wave 2 is max(loadSnapshotTotals 2, loadStreakPicks 1) = 2. The
 * second wave can't join the first: it needs the last scored gameweek
 * number, and the streak picks need the roster's human count and the
 * tipped match ids.
 *
 * Movement's "previous gameweek" is deliberately **the gameweek before the
 * last SCORED one** -- not `resolveCurrentGameweekForCompetition() - 1`,
 * which is the Pick Board's "next gameweek open for picking" and rolls over
 * to the next number the moment the last one finishes, before it has any
 * results of its own. In that gap (last gameweek fully scored, next one
 * selected but not yet kicked off), current-1 lands ON the last scored
 * gameweek instead of before it, so live rank gets diffed against itself --
 * movement reads 0 for everyone until the next gameweek is scored, which is
 * exactly the "compare against the most recent snapshot" failure ADR 0012
 * D2 says not to build (issue #199). Deriving "previous" from the scored
 * history instead keeps it correct on both sides of that gap.
 */
export async function loadLeaderboard(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  viewerId: string,
): Promise<LeaderboardView> {
  const [scores, scoredGameweeks, tippedMatches] = await Promise.all([
    scoresForCompetition(supabase, competitionId, seasonId),
    loadScoredGameweeks(supabase, competitionId, seasonId),
    loadTippedMatches(supabase, competitionId, seasonId),
  ]);

  const lastScoredNumber = scoredGameweeks.reduce<number | null>(
    (max, gw) => (max === null || gw.number > max ? gw.number : max),
    null,
  );
  const previousGameweekNumber =
    lastScoredNumber !== null ? lastScoredNumber - 1 : null;

  const finishedMatchIds = tippedMatches
    .filter(countsTowardStreak)
    .map((match) => match.id);
  const humanCount = scores.filter((row) => !row.isBot).length;

  const [snapshotTotals, streakPicks] = await Promise.all([
    lastScoredNumber !== null && previousGameweekNumber !== null
      ? loadSnapshotTotals(supabase, competitionId, seasonId, [
          previousGameweekNumber,
          lastScoredNumber,
        ])
      : Promise.resolve(new Map<number, WrapSnapshotRow[]>()),
    loadStreakPicks(supabase, competitionId, finishedMatchIds, humanCount),
  ]);

  const players = scores.map((row) => ({
    id: row.playerId,
    isBot: row.isBot,
    joinedAt: row.joinedAt,
  }));
  const previousRows =
    previousGameweekNumber !== null
      ? (snapshotTotals.get(previousGameweekNumber) ?? null)
      : null;

  return {
    rows: buildLeaderboard({
      scores,
      previousSeasonTotals: (previousRows ?? []).map((row) => ({
        playerId: row.playerId,
        seasonTotal: row.seasonTotal,
      })),
      scoredGameweeks,
      streaks: computeStreaks({
        matches: tippedMatches,
        picks: streakPicks,
        players,
      }),
      viewerId,
    }),
    wrap:
      lastScoredNumber !== null
        ? buildGameweekWrap({
            gameweekNumber: lastScoredNumber,
            players,
            matches: tippedMatches,
            picks: streakPicks,
            scoredGameweekNumbers: scoredGameweeks.map((gw) => gw.number),
            snapshot: snapshotTotals.get(lastScoredNumber) ?? [],
            previousSnapshot: previousRows,
          })
        : null,
    scored: scores.some((row) => row.matchesScored > 0),
  };
}
