import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  selectTopMatchup,
  selectMatch2,
  chooseRankSource,
  type SelectionFixture,
  type ClubPosition,
  type ClubPlayedCount,
  type RankSource,
} from "@/lib/match-selection/rules";
import { isGameweekScoringComplete, toScoringSlot } from "./completion";

/**
 * Production wiring for the per-gameweek Tipped Match selection runner
 * (issue #92). Called from `sync/matches`'s route handler on the existing
 * sync cadence -- no schedule of its own. Per docs/adr/0006's "When
 * selection runs" / "Selection is written, not recomputed."
 *
 * D7 (issue #92 decision log): "already selected" for the next gameweek
 * means `match_1_id is not null`, not "both slots set". `selectTopMatchup`
 * only ever returns null when the fixtures pool itself is empty (D8's
 * no-op case, where no row gets written at all); `selectMatch2` legitimately
 * returns null whenever every remaining fixture has already kicked off -- a
 * genuine Skipped Slot (docs/adr/0001), not corruption. So `match_1_id` set
 * + `match_2_id` null is a valid, final, write-once outcome this runner can
 * itself produce.
 *
 * D6: scoped per competition, mirroring #35's bot-generation D4 -- gameweeks
 * is competition-scoped (issue #69 / ADR 0004), matches is global.
 *
 * D1: fixture-to-gameweek grouping comes from `matches.matchday`, populated
 * by `seed-fixtures.mjs` and `sync/matches`'s own update from
 * football-data.org's `matchday` field -- not a second provider call.
 */

const LIVE_STANDINGS_STALE_MS = 48 * 60 * 60 * 1000; // D4

interface GameweekRow {
  id: string;
  competition_id: string;
  season_id: string;
  number: number;
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
  provider_match_id: string;
}

interface TeamStandingsRow {
  team_id: string;
  position: number;
  played: number;
  updated_at: string;
}

interface TeamRow {
  id: string;
  previous_season_position: number | null;
}

export interface SelectNextGameweekSlotsOptions {
  /** Injected for tests; server time otherwise. */
  now?: Date;
  /** Injected for tests; `Math.random` otherwise (see selectMatch2). */
  random?: () => number;
  /**
   * Injected for the scripted-gameweek-simulation harness (issue #92's
   * scope), which runs against shared staging: without this, an unscoped
   * call would also evaluate and potentially write real gameweek rows for
   * whatever other competitions already exist on that project. Production
   * (`sync/matches`) never passes this -- it processes every competition,
   * per D6.
   */
  competitionIds?: string[];
}

/**
 * Resolves each competition's next-gameweek eligibility and rank-source
 * inputs independently, then writes at most one `gameweeks` row per
 * competition per call. Returns the number of gameweeks newly selected
 * (0 means nothing to do this cycle) -- the `done` count `runIsolatedStep`
 * expects.
 */
export async function selectNextGameweekSlots(
  supabase: SupabaseClient,
  options: SelectNextGameweekSlotsOptions = {},
): Promise<number> {
  const now = options.now ?? new Date();

  const competitionIds =
    options.competitionIds ?? (await loadCompetitionIds(supabase));
  if (competitionIds.length === 0) return 0;

  const gameweeksByCompetition = await loadGameweeksByCompetition(
    supabase,
    competitionIds,
  );

  const teamsById = await loadTeams(supabase);
  const rankContextCache = new Map<string, RankSourceContext>();

  let selected = 0;
  for (const competitionId of competitionIds) {
    const gameweeks = gameweeksByCompetition.get(competitionId) ?? [];
    const wrote = await selectForCompetition(
      supabase,
      gameweeks,
      teamsById,
      rankContextCache,
      now,
      options.random,
    );
    if (wrote) selected += 1;
  }

  return selected;
}

async function selectForCompetition(
  supabase: SupabaseClient,
  gameweeks: GameweekRow[],
  teamsById: Map<string, TeamRow>,
  rankContextCache: Map<string, RankSourceContext>,
  now: Date,
  random?: () => number,
): Promise<boolean> {
  const withAnySlot = gameweeks.filter(
    (gw) => gw.match_1_id !== null || gw.match_2_id !== null,
  );
  if (withAnySlot.length === 0) return false;

  const latest = withAnySlot.reduce((a, b) => (b.number > a.number ? b : a));

  const slotMatchIds = [latest.match_1_id, latest.match_2_id].filter(
    (id): id is string => id !== null,
  );
  const slotMatchById = await loadMatches(supabase, slotMatchIds);

  const slot1 = toScoringSlot(
    latest.match_1_id,
    latest.match_1_voided_at,
    slotMatchById,
  );
  const slot2 = toScoringSlot(
    latest.match_2_id,
    latest.match_2_voided_at,
    slotMatchById,
  );
  if (!isGameweekScoringComplete(slot1, slot2)) return false;

  const nextNumber = latest.number + 1;
  const existing = gameweeks.find(
    (gw) => gw.season_id === latest.season_id && gw.number === nextNumber,
  );
  // D7: already selected iff match_1_id is set -- match_2_id null is a
  // legitimate final Skipped Slot, not "not yet done".
  if (existing && existing.match_1_id !== null) return false;

  const { data: fixtureRows, error: fixturesError } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id, kickoff_time, status, provider_match_id")
    .eq("season_id", latest.season_id)
    .eq("matchday", nextNumber);
  if (fixturesError) throw fixturesError;

  // D8: end of season (or matchday not yet synced) -- clean no-op, not a
  // failure, unlike #89's GW1 seeding where an empty pool is an error.
  if (!fixtureRows || fixtureRows.length === 0) return false;

  const fixtures: SelectionFixture[] = (fixtureRows as MatchRow[]).map((m) => ({
    id: m.id,
    teamAId: m.team_a_id,
    teamBId: m.team_b_id,
    kickoffTime: new Date(m.kickoff_time),
    providerMatchId: m.provider_match_id,
  }));

  const previousMatch1Team = latest.match_1_id
    ? slotMatchById.get(latest.match_1_id)
    : undefined;
  const previousMatch1TeamIds = previousMatch1Team
    ? [previousMatch1Team.team_a_id, previousMatch1Team.team_b_id]
    : [];

  const rankContext = await getRankSourceContext(
    supabase,
    latest.season_id,
    rankContextCache,
    now,
  );

  const teamIds = dedupe(fixtures.flatMap((f) => [f.teamAId, f.teamBId]));
  const positions = buildPositions(teamIds, rankContext, teamsById);

  const match1 = selectTopMatchup({
    fixtures,
    positions,
    previousMatch1TeamIds,
  });
  // Unreachable given the non-empty fixtures guard above (selectTopMatchup
  // only returns null on an empty pool), kept for defensive symmetry with D8.
  if (!match1) return false;

  const match2 = selectMatch2({
    fixtures,
    match1FixtureId: match1.id,
    now,
    random,
  });

  const row = {
    competition_id: latest.competition_id,
    season_id: latest.season_id,
    number: nextNumber,
    match_1_id: match1.id,
    match_2_id: match2?.id ?? null,
  };

  if (existing) {
    const { error } = await supabase
      .from("gameweeks")
      .update(row)
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("gameweeks").insert(row);
    if (error) throw error;
  }

  return true;
}

interface RankSourceContext {
  rankSource: RankSource;
  positionByTeamId: Map<string, number>;
}

async function getRankSourceContext(
  supabase: SupabaseClient,
  seasonId: string,
  cache: Map<string, RankSourceContext>,
  now: Date,
): Promise<RankSourceContext> {
  const cached = cache.get(seasonId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("team_standings")
    .select("team_id, position, played, updated_at")
    .eq("season_id", seasonId);
  if (error) throw error;

  const rows = (data ?? []) as TeamStandingsRow[];
  const playedCounts: ClubPlayedCount[] = rows.map((r) => ({
    teamId: r.team_id,
    played: r.played,
  }));
  const liveStandingsAvailable =
    rows.length > 0 &&
    rows.every(
      (r) =>
        now.getTime() - new Date(r.updated_at).getTime() <=
        LIVE_STANDINGS_STALE_MS,
    );

  const rankSource = chooseRankSource({ playedCounts, liveStandingsAvailable });
  const positionByTeamId = new Map(rows.map((r) => [r.team_id, r.position]));

  const context: RankSourceContext = { rankSource, positionByTeamId };
  cache.set(seasonId, context);
  return context;
}

function buildPositions(
  teamIds: string[],
  rankContext: RankSourceContext,
  teamsById: Map<string, TeamRow>,
): ClubPosition[] {
  return teamIds.map((teamId) => {
    if (rankContext.rankSource === "live") {
      return {
        teamId,
        position: rankContext.positionByTeamId.get(teamId) ?? null,
      };
    }
    return {
      teamId,
      position: teamsById.get(teamId)?.previous_season_position ?? null,
    };
  });
}

async function loadCompetitionIds(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("competitions")
    .select("id")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((c: { id: string }) => c.id);
}

async function loadGameweeksByCompetition(
  supabase: SupabaseClient,
  competitionIds: string[],
): Promise<Map<string, GameweekRow[]>> {
  const { data, error } = await supabase
    .from("gameweeks")
    .select(
      "id, competition_id, season_id, number, match_1_id, match_2_id, match_1_voided_at, match_2_voided_at",
    )
    .in("competition_id", competitionIds)
    .order("number");
  if (error) throw error;

  const byCompetition = new Map<string, GameweekRow[]>();
  for (const row of (data ?? []) as GameweekRow[]) {
    const bucket = byCompetition.get(row.competition_id) ?? [];
    bucket.push(row);
    byCompetition.set(row.competition_id, bucket);
  }
  return byCompetition;
}

async function loadMatches(
  supabase: SupabaseClient,
  matchIds: string[],
): Promise<Map<string, MatchRow>> {
  if (matchIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id, kickoff_time, status, provider_match_id")
    .in("id", matchIds);
  if (error) throw error;
  return new Map(((data ?? []) as MatchRow[]).map((m) => [m.id, m]));
}

async function loadTeams(
  supabase: SupabaseClient,
): Promise<Map<string, TeamRow>> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, previous_season_position");
  if (error) throw error;
  return new Map(((data ?? []) as TeamRow[]).map((t) => [t.id, t]));
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}
