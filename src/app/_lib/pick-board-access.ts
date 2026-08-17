import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMatchLocked, scoresForCompetition } from "@/lib/competitions/scope";
import { rankScores } from "@/lib/leaderboard/rank";
import { orderBoardSlots } from "@/lib/pick-board/order-slots";

// DB-fetching glue for the Pick Board route (issue #90) -- deliberately
// outside src/lib/** (same rationale as gameweek-access.ts and
// table-prediction-access.ts: plain scoped Supabase round-trips, no
// decision logic worth golden-value testing on its own).
//
// The own-pick and own-score reads below are the security-sensitive part
// of this file (issue #90's done-when: "no route on this page returns
// another player's pick") -- every `picks`/`scores` query here is scoped
// by BOTH `player_id = playerId` (the session player, never any other) AND
// `match_id IN (this gameweek's tipped matches)`, per AGENTS.md's
// match_id-alone-is-not-competition-scope rule.

export interface PickBoardTeam {
  id: string;
  name: string;
  shortCode: string | null;
  leaguePosition: number | null;
}

export type PickBoardProvenance = "top_matchup" | "random_pick";

export interface PickBoardMatchInfo {
  id: string;
  kickoffUtcIso: string;
  status: "scheduled" | "completed" | "postponed";
  home: PickBoardTeam;
  away: PickBoardTeam;
  homeScore: number | null;
  awayScore: number | null;
}

/**
 * A Skipped Slot (fixture postponed before lock, docs/adr/0001) has no
 * match at all -- distinct from a Voided Match (postponed after lock,
 * `voided: true` below), which stays referenced. Presentation for both is
 * deliberately undrawn by docs/adr/0007; this loader still surfaces which
 * one it is so the page can render an honest minimal state for each.
 */
export type PickBoardSlot =
  | { kind: "skipped" }
  | {
      kind: "match";
      provenance: PickBoardProvenance;
      match: PickBoardMatchInfo;
      voided: boolean;
      ownPick: { homeScore: number; awayScore: number } | null;
      points: number | null;
    };

export interface PickBoardGameweek {
  number: number;
  slots: [PickBoardSlot, PickBoardSlot];
  /** Earliest kickoff among this gameweek's still-open slots; null once
   * both are locked, voided or skipped -- the header has no countdown to
   * show then (ADR: "shows the earliest lock across the board"). */
  earliestOpenKickoffUtcIso: string | null;
}

interface GameweekRow {
  id: string;
  match_1_id: string | null;
  match_2_id: string | null;
  match_1_voided_at: string | null;
  match_2_voided_at: string | null;
}

interface MatchRow {
  id: string;
  team_a_id: string;
  team_b_id: string;
  kickoff_time: string;
  status: string;
  team_a_score: number | null;
  team_b_score: number | null;
}

/**
 * A gameweek's two Tipped Match slot columns, for a specific competition +
 * season + number -- shared by loadPickBoardGameweek (the current
 * gameweek) and loadLastWeekSummary (the previous one), so the fetch
 * itself can't drift between the two callers.
 */
async function loadGameweekSlotRow(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string,
  gameweekNumber: number,
): Promise<GameweekRow | null> {
  const { data: gwRow, error } = await supabase
    .from("gameweeks")
    .select("id, match_1_id, match_2_id, match_1_voided_at, match_2_voided_at")
    .eq("season_id", seasonId)
    .eq("competition_id", competitionId)
    .eq("number", gameweekNumber)
    .order("id")
    .maybeSingle<GameweekRow>();
  if (error) throw error;
  return gwRow ?? null;
}

/** Shared by both loaders below -- see loadTeamsById's own doc comment for
 * what `teamsById` holds. */
function buildPickBoardTeam(
  teamId: string,
  teamsById: Map<
    string,
    { name: string; shortCode: string | null; position: number | null }
  >,
): PickBoardTeam {
  const team = teamsById.get(teamId);
  return {
    id: teamId,
    name: team?.name ?? "Unknown",
    shortCode: team?.shortCode ?? null,
    leaguePosition: team?.position ?? null,
  };
}

async function loadTeamsById(
  supabase: SupabaseClient,
  teamIds: string[],
  seasonId: string,
): Promise<
  Map<
    string,
    { name: string; shortCode: string | null; position: number | null }
  >
> {
  const result = new Map<
    string,
    { name: string; shortCode: string | null; position: number | null }
  >();
  if (teamIds.length === 0) return result;

  const [teamsResult, standingsResult] = await Promise.all([
    supabase.from("teams").select("id, name, short_code").in("id", teamIds),
    supabase
      .from("team_standings")
      .select("team_id, position")
      .eq("season_id", seasonId)
      .in("team_id", teamIds),
  ]);
  if (teamsResult.error) throw teamsResult.error;
  if (standingsResult.error) throw standingsResult.error;

  const positionByTeamId = new Map(
    (standingsResult.data ?? []).map(
      (row: { team_id: string; position: number }) => [
        row.team_id,
        row.position,
      ],
    ),
  );
  for (const team of teamsResult.data ?? []) {
    result.set(team.id, {
      name: team.name,
      shortCode: team.short_code,
      position: positionByTeamId.get(team.id) ?? null,
    });
  }
  return result;
}

/**
 * The current gameweek's two Tipped Match slots, this player's own picks
 * and points for them, and enough team/standings data to render both slot
 * cards. Null if no season is seeded or no gameweek has ever had a Tipped
 * Match (gameweek 1 not yet selected -- see issue #89).
 *
 * `seasonId` and `gameweekNumber` are caller-resolved (the Pick Board route
 * resolves both once and shares them across every loader) rather than
 * re-resolved here -- see docs/standards/PERFORMANCE_TESTING_STANDARD.md §4.1.
 */
export async function loadPickBoardGameweek(
  supabase: SupabaseClient,
  competitionId: string,
  playerId: string,
  now: Date,
  seasonId: string,
  gameweekNumber: number,
): Promise<PickBoardGameweek | null> {
  const gwRow = await loadGameweekSlotRow(
    supabase,
    competitionId,
    seasonId,
    gameweekNumber,
  );
  if (!gwRow) return null;

  const matchIds = [gwRow.match_1_id, gwRow.match_2_id].filter(
    (id): id is string => id !== null,
  );

  const [matchesResult, picksResult, scoresResult] = await Promise.all([
    matchIds.length > 0
      ? supabase
          .from("matches")
          .select(
            "id, team_a_id, team_b_id, kickoff_time, status, team_a_score, team_b_score",
          )
          .in("id", matchIds)
      : Promise.resolve({ data: [] as MatchRow[], error: null }),
    // Own picks only -- scoped by player_id AND match_id, never a bare
    // match_id filter (AGENTS.md).
    matchIds.length > 0
      ? supabase
          .from("picks")
          .select("match_id, pred_home_score, pred_away_score")
          .eq("player_id", playerId)
          .in("match_id", matchIds)
      : Promise.resolve({ data: [], error: null }),
    // Own points only -- same scoping as above.
    matchIds.length > 0
      ? supabase
          .from("scores")
          .select("match_id, points")
          .eq("player_id", playerId)
          .in("match_id", matchIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (matchesResult.error) throw matchesResult.error;
  if (picksResult.error) throw picksResult.error;
  if (scoresResult.error) throw scoresResult.error;

  const matches: MatchRow[] = matchesResult.data ?? [];
  const teamIds = Array.from(
    new Set(matches.flatMap((m) => [m.team_a_id, m.team_b_id])),
  );
  const teamsById = await loadTeamsById(supabase, teamIds, seasonId);

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const pickByMatchId = new Map(
    (picksResult.data ?? []).map(
      (p: {
        match_id: string;
        pred_home_score: number;
        pred_away_score: number;
      }) => [p.match_id, p],
    ),
  );
  const pointsByMatchId = new Map(
    (scoresResult.data ?? []).map((s: { match_id: string; points: number }) => [
      s.match_id,
      s.points,
    ]),
  );

  const buildTeam = (teamId: string) => buildPickBoardTeam(teamId, teamsById);

  function buildSlot(
    matchId: string | null,
    voidedAt: string | null,
    provenance: PickBoardProvenance,
  ): PickBoardSlot {
    if (matchId === null) return { kind: "skipped" };
    const match = matchById.get(matchId);
    if (!match) return { kind: "skipped" };

    const pick = pickByMatchId.get(matchId);
    return {
      kind: "match",
      provenance,
      match: {
        id: match.id,
        kickoffUtcIso: match.kickoff_time,
        status: match.status as PickBoardMatchInfo["status"],
        home: buildTeam(match.team_a_id),
        away: buildTeam(match.team_b_id),
        homeScore: match.team_a_score,
        awayScore: match.team_b_score,
      },
      // `voided_at` is the authoritative Voided Match signal (CLAUDE.md), but
      // also defensively treat `matches.status === "postponed"` as voided on
      // its own -- postponement handling isn't built yet (no sync writes
      // either signal today), so nothing guarantees `voided_at` gets set in
      // the same instant `status` flips. Without this, a sync step that
      // updates `status` first (before the gameweek's voided/skip columns
      // catch up) would render a postponed match as a normal playable card.
      // Voided is the safe default either way: it hides pick entry, which a
      // postponed match must never allow regardless of which signal moved.
      voided: voidedAt !== null || match.status === "postponed",
      ownPick: pick
        ? { homeScore: pick.pred_home_score, awayScore: pick.pred_away_score }
        : null,
      points: pointsByMatchId.get(matchId) ?? null,
    };
  }

  const slot1 = buildSlot(
    gwRow.match_1_id,
    gwRow.match_1_voided_at,
    "top_matchup",
  );
  const slot2 = buildSlot(
    gwRow.match_2_id,
    gwRow.match_2_voided_at,
    "random_pick",
  );

  const openKickoffs = [slot1, slot2]
    .filter(
      (slot): slot is Extract<PickBoardSlot, { kind: "match" }> =>
        slot.kind === "match" &&
        !slot.voided &&
        !isMatchLocked(new Date(slot.match.kickoffUtcIso), now),
    )
    .map((slot) => slot.match.kickoffUtcIso)
    .sort();

  // The DB stores the sourced slots (match_1 = marquee, match_2 = random pick);
  // the board renders them in kickoff order, the marquee breaking a kickoff tie
  // (docs/adr/0007's "fixed order, never reordered" display rule is superseded
  // by CLAUDE.md's "shown in kickoff order"). Sourced provenance per card is
  // preserved as-is.
  const orderedSlots = orderBoardSlots(
    [slot1, slot2],
    (slot) => (slot.kind === "match" ? slot.match.kickoffUtcIso : null),
    (slot) => slot.kind === "match" && slot.provenance === "top_matchup",
  );

  return {
    number: gameweekNumber,
    slots: [orderedSlots[0], orderedSlots[1]] as [PickBoardSlot, PickBoardSlot],
    earliestOpenKickoffUtcIso: openKickoffs[0] ?? null,
  };
}

export interface SeasonStats {
  points: number;
  rank: number;
}

/**
 * This player's season total and rank -- from `scoresForCompetition`
 * (src/lib/competitions/scope.ts, already competition+season scoped) fed
 * through the pure `rankScores` (issue #90, decision 3). Deliberately not
 * `standings_snapshots.season_standing`, for two independent reasons: that
 * column is bot-inclusive by design (#23 D3) where this rank is not (see
 * below), and it only updates when a gameweek completes, where this is as
 * fresh as the scores themselves. Null when this competition has never had
 * a scored match -- the day-one variant (ADR: "no rank, no season
 * points... stats strip drops rank and points entirely").
 *
 * **Bots are excluded from the ranking** (docs/adr/0012-leaderboard-view.md
 * D12): they can't win the season title, so a rank that counts them answers
 * a question nobody asks, and the leaderboard route ranks the same way. The
 * two surfaces showing one player two different ranks on the same day is
 * the trust bug ADR 0012 D2 exists to prevent, so if either basis changes,
 * both must change together.
 */
export async function loadSeasonStats(
  supabase: SupabaseClient,
  competitionId: string,
  playerId: string,
  seasonId: string,
): Promise<SeasonStats | null> {
  const scores = await scoresForCompetition(supabase, competitionId, seasonId);
  const hasAnyScoredMatch = scores.some((row) => row.matchesScored > 0);
  if (!hasAnyScoredMatch) return null;

  const ranked = rankScores(
    scores
      .filter((row) => !row.isBot)
      .map((row) => ({ playerId: row.playerId, points: row.points })),
  );
  // A bot viewing its own Pick Board isn't a real case (bots don't log in),
  // but it would land here with no rank -- null is the honest answer.
  const own = ranked.find((row) => row.playerId === playerId);
  if (!own) return null;

  return { points: own.points, rank: own.rank };
}

export interface LastWeekMatchResult {
  home: PickBoardTeam;
  away: PickBoardTeam;
  homeScore: number | null;
  awayScore: number | null;
  voided: boolean;
}

export interface LastWeekSummary {
  gameweekNumber: number;
  points: number;
  matches: LastWeekMatchResult[];
}

/**
 * The previous gameweek's own points and each Tipped Match's result, for
 * the last-week strip (ADR: "Home advances immediately when a Gameweek
 * finishes, carrying a compact last-week strip"). Null if there's no
 * previous gameweek, or it hasn't been scored yet -- the strip only makes
 * sense once there's a payoff to show, matching the day-one variant's
 * "revert automatically once scores exist" rule.
 *
 * `seasonId` and `previousNumber` are caller-resolved, same rationale as
 * loadPickBoardGameweek -- this also lets the Pick Board route run this
 * loader in the same parallel wave as the current gameweek's, rather than
 * serially after it (it no longer depends on that loader's result).
 */
export async function loadLastWeekSummary(
  supabase: SupabaseClient,
  competitionId: string,
  playerId: string,
  seasonId: string,
  previousNumber: number,
): Promise<LastWeekSummary | null> {
  if (previousNumber < 1) return null;

  const gwRow = await loadGameweekSlotRow(
    supabase,
    competitionId,
    seasonId,
    previousNumber,
  );
  if (!gwRow) return null;

  const matchIds = [gwRow.match_1_id, gwRow.match_2_id].filter(
    (id): id is string => id !== null,
  );
  if (matchIds.length === 0) return null;

  const [matchesResult, scoresResult] = await Promise.all([
    supabase
      .from("matches")
      .select("id, team_a_id, team_b_id, team_a_score, team_b_score")
      .in("id", matchIds),
    // Own points only, same scoping rule as loadPickBoardGameweek above.
    supabase
      .from("scores")
      .select("match_id, points")
      .eq("player_id", playerId)
      .in("match_id", matchIds),
  ]);
  if (matchesResult.error) throw matchesResult.error;
  if (scoresResult.error) throw scoresResult.error;

  const scoreRows: { match_id: string; points: number }[] =
    scoresResult.data ?? [];
  if (scoreRows.length === 0) return null; // not yet scored

  interface LastWeekMatchRow {
    id: string;
    team_a_id: string;
    team_b_id: string;
    team_a_score: number | null;
    team_b_score: number | null;
  }
  const matches: LastWeekMatchRow[] = matchesResult.data ?? [];
  const teamIds = Array.from(
    new Set(matches.flatMap((m) => [m.team_a_id, m.team_b_id])),
  );
  const teamsById = await loadTeamsById(supabase, teamIds, seasonId);

  const buildTeam = (teamId: string) => buildPickBoardTeam(teamId, teamsById);

  const voidedMatchIds = new Set(
    [
      gwRow.match_1_voided_at ? gwRow.match_1_id : null,
      gwRow.match_2_voided_at ? gwRow.match_2_id : null,
    ].filter((id): id is string => id !== null),
  );

  const totalPoints = scoreRows.reduce((sum, row) => sum + row.points, 0);

  return {
    gameweekNumber: previousNumber,
    points: totalPoints,
    matches: matches.map((match) => ({
      home: buildTeam(match.team_a_id),
      away: buildTeam(match.team_b_id),
      homeScore: match.team_a_score,
      awayScore: match.team_b_score,
      voided: voidedMatchIds.has(match.id),
    })),
  };
}
