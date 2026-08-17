// Staging world helpers for issue #22 (scripts/scripted-gameweek-simulation).
// Everything this module creates is script-owned synthetic data and is deleted
// by disposeSimulationWorld() — same disposable pattern as
// scripts/verify-competition-scope-isolation.mjs (D7). Runs against the shared
// staging project from local dev only (D1a), never CI: `npm test`'s default
// include never collects *.sim.ts, and this throws if staging creds are absent.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function requireStagingEnv(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run from local dev:\n" +
        "  SUPABASE_URL=<staging URL> SUPABASE_SERVICE_ROLE_KEY=<staging key> \\\n" +
        "  npx vitest run --config scripts/scripted-gameweek-simulation/vitest.config.ts\n" +
        "  (add SIM_KEEP_WORLD=1 to keep the synthetic competition on staging for inspection)",
    );
  }
  return { url, key };
}

export function createStagingClient(): SupabaseClient {
  const { url, key } = requireStagingEnv();
  return createClient(url, key, { auth: { persistSession: false } });
}

function pastIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export interface SimulationWorld {
  supabase: SupabaseClient;
  seasonId: string;
  teamAId: string;
  teamBId: string;
  matchOneId: string;
  matchTwoId: string;
  competitionAId: string;
  competitionBId: string;
  gameweekAId: string;
  gameweekBId: string;
  playerA1: string;
  playerA2: string;
  playerA3: string;
  playerB1: string;
  playerB2: string;
  created: {
    seasons: string[];
    teams: string[];
    matches: string[];
    competitions: string[];
    gameweeks: string[];
    players: string[];
  };
}

export async function createSimulationWorld(
  supabase: SupabaseClient,
): Promise<SimulationWorld> {
  const stamp = Date.now();
  const created: SimulationWorld["created"] = {
    seasons: [],
    teams: [],
    matches: [],
    competitions: [],
    gameweeks: [],
    players: [],
  };

  const insert = async <T>(
    table: string,
    row: Record<string, unknown>,
  ): Promise<T> => {
    const { data, error } = await supabase
      .from(table)
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id as T;
  };

  // is_current is set explicitly rather than left to the column default.
  // The default was `true` until issue #174, which meant this insert alone
  // gave staging a second current season and 500ed every authenticated
  // route (SIM_KEEP_WORLD runs left it behind). Stated here so the script
  // is correct regardless of what the default happens to be.
  const seasonId = await insert<string>("seasons", {
    label: `sim-${stamp}`,
    start_date: "2026-08-01",
    end_date: "2027-05-31",
    is_current: false,
  });
  created.seasons.push(seasonId);

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .insert([
      {
        name: `Sim A ${stamp}`,
        full_name: `Sim Team A ${stamp}`,
        display_name: `Sim A ${stamp}`,
        provider_name: "sim",
        provider_team_id: `sim-a-${stamp}`,
      },
      {
        name: `Sim B ${stamp}`,
        full_name: `Sim Team B ${stamp}`,
        display_name: `Sim B ${stamp}`,
        provider_name: "sim",
        provider_team_id: `sim-b-${stamp}`,
      },
    ])
    .select("id");
  if (teamsError) throw teamsError;
  const [teamAId, teamBId] = teams!.map((t: { id: string }) => t.id);
  created.teams.push(teamAId, teamBId);

  const matchOneId = await insert<string>("matches", {
    season_id: seasonId,
    provider_name: "sim",
    provider_match_id: `sim-m1-${stamp}`,
    team_a_id: teamAId,
    team_b_id: teamBId,
    kickoff_time: pastIso(3), // already past -> narrative "locked"
  });
  created.matches.push(matchOneId);

  const matchTwoId = await insert<string>("matches", {
    season_id: seasonId,
    provider_name: "sim",
    provider_match_id: `sim-m2-${stamp}`,
    team_a_id: teamBId,
    team_b_id: teamAId,
    kickoff_time: pastIso(3),
  });
  created.matches.push(matchTwoId);

  const competitionAId = await insert<string>("competitions", {
    name: `Sim Comp A ${stamp}`,
    code_hash: "sim-unused",
  });
  created.competitions.push(competitionAId);

  const competitionBId = await insert<string>("competitions", {
    name: `Sim Comp B ${stamp}`,
    code_hash: "sim-unused",
  });
  created.competitions.push(competitionBId);

  // Both competitions share the same *global* match_1 fixture; only A tips
  // match two. The scoped unique (competition_id, season_id, number) lets both
  // gameweeks be number 1 in the same season without colliding.
  const gameweekAId = await insert<string>("gameweeks", {
    competition_id: competitionAId,
    season_id: seasonId,
    number: 1,
    match_1_id: matchOneId,
    match_2_id: matchTwoId,
  });
  created.gameweeks.push(gameweekAId);

  const gameweekBId = await insert<string>("gameweeks", {
    competition_id: competitionBId,
    season_id: seasonId,
    number: 1,
    match_1_id: matchOneId,
  });
  created.gameweeks.push(gameweekBId);

  const playerIds = await Promise.all(
    [
      ["Sim A1", "sim-1"],
      ["Sim A2", "sim-2"],
      ["Sim A3", "sim-3"],
      ["Sim B1", "sim-4"],
      ["Sim B2", "sim-5"],
    ].map(async ([displayName, code]) => {
      const competitionId =
        code === "sim-1" || code === "sim-2" || code === "sim-3"
          ? competitionAId
          : competitionBId;
      const id = await insert<string>("players", {
        competition_id: competitionId,
        display_name: `${displayName} ${stamp}`,
        pin_hash: "sim-unused",
      });
      created.players.push(id);
      return id;
    }),
  );
  const [playerA1, playerA2, playerA3, playerB1, playerB2] = playerIds;

  return {
    supabase,
    seasonId,
    teamAId,
    teamBId,
    matchOneId,
    matchTwoId,
    competitionAId,
    competitionBId,
    gameweekAId,
    gameweekBId,
    playerA1,
    playerA2,
    playerA3,
    playerB1,
    playerB2,
    created,
  };
}

/**
 * Inserts one extra `matches` row at a given `matchday`, for issue #92's
 * selection-runner stage -- `createSimulationWorld`'s two matches have no
 * matchday set (irrelevant to the scoring engine), but `selectNextGameweekSlots`
 * needs a real next-matchday fixture pool to select from. Pushed onto
 * `world.created.matches` so `disposeSimulationWorld` cleans it up too.
 */
export async function insertNextGameweekFixture(
  supabase: SupabaseClient,
  world: SimulationWorld,
  params: { providerMatchId: string; matchday: number; kickoffTime: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("matches")
    .insert({
      season_id: world.seasonId,
      provider_name: "sim",
      provider_match_id: params.providerMatchId,
      team_a_id: world.teamAId,
      team_b_id: world.teamBId,
      kickoff_time: params.kickoffTime,
      matchday: params.matchday,
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  world.created.matches.push(id);
  return id;
}

/** Voids/un-voids one gameweek slot (the authoritative voided signal, D4). */
export async function setSlotVoided(
  supabase: SupabaseClient,
  gameweekId: string,
  slot: "match_1" | "match_2",
  voided: boolean,
): Promise<void> {
  const column = `${slot}_voided_at`;
  const { error } = await supabase
    .from("gameweeks")
    .update({ [column]: voided ? new Date().toISOString() : null })
    .eq("id", gameweekId);
  if (error) throw error;
}

/** Sets a match's status directly (used to exercise the D4 defensive void). */
export async function setMatchStatus(
  supabase: SupabaseClient,
  matchId: string,
  status: "completed" | "postponed",
): Promise<void> {
  const { error } = await supabase
    .from("matches")
    .update({ status })
    .eq("id", matchId);
  if (error) throw error;
}

/** Deletes every row this world owns, in FK-safe order (D7). */
export async function disposeSimulationWorld(
  supabase: SupabaseClient,
  world: SimulationWorld,
): Promise<void> {
  const { created, matchOneId, matchTwoId } = world;
  const matchIds = [matchOneId, matchTwoId];

  await supabase.from("gameweeks").delete().in("id", created.gameweeks);
  await supabase.from("scores").delete().in("match_id", matchIds);
  await supabase.from("picks").delete().in("match_id", matchIds);
  await supabase.from("players").delete().in("id", created.players);
  await supabase.from("matches").delete().in("id", created.matches);
  await supabase.from("competitions").delete().in("id", created.competitions);
  await supabase.from("teams").delete().in("id", created.teams);
  await supabase.from("seasons").delete().in("id", created.seasons);
}

export interface RowCounts {
  competitions: number;
  gameweeks: number;
  matches: number;
  picks: number;
  players: number;
  scores: number;
  seasons: number;
  teams: number;
}

/**
 * Global row counts for every table the simulation touches. D7 asserts the
 * synthetic tables return to their pre-run counts, so the scenario snapshots
 * these before creating its world and compares after disposal.
 */
export async function snapshotRowCounts(
  supabase: SupabaseClient,
): Promise<RowCounts> {
  const tables = [
    "competitions",
    "gameweeks",
    "matches",
    "picks",
    "players",
    "scores",
    "seasons",
    "teams",
  ] as const;
  const entries = await Promise.all(
    tables.map(async (table) => {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return { name: table, count: count ?? 0 };
    }),
  );
  const result = {} as RowCounts;
  for (const { name, count } of entries) result[name] = count;
  return result;
}

/** Cleanup SQL for a kept world, safe to re-run (matches on sim provider markers). */
const KEPT_WORLD_CLEANUP_SQL = `delete from scores where match_id in (select id from matches where provider_name = 'sim');
delete from picks where match_id in (select id from matches where provider_name = 'sim');
delete from gameweeks where competition_id in (select id from competitions where name like 'Sim Comp %');
delete from players where competition_id in (select id from competitions where name like 'Sim Comp %');
delete from matches where provider_name = 'sim';
delete from competitions where name like 'Sim Comp %';
delete from teams where provider_name = 'sim';
delete from seasons where label like 'sim-%';`;

/**
 * Printed by the scenario when SIM_KEEP_WORLD=1: the synthetic competition is
 * left on staging for inspection (Supabase dashboard, or later drives of the
 * real Pick Board/leaderboard UI), and this warning carries the ids plus the
 * recipe to remove it afterwards.
 */
export function printKeptWorldWarning(world: SimulationWorld): void {
  console.log("");
  console.log(
    "SIM_KEEP_WORLD=1 — synthetic world LEFT on staging (cleanup skipped).",
  );
  console.log(`Competition A: ${world.competitionAId}`);
  console.log(`Competition B: ${world.competitionBId}`);
  console.log(
    `Season: ${world.seasonId}  Gameweeks: ${world.gameweekAId}, ${world.gameweekBId}`,
  );
  console.log(`Matches: ${world.matchOneId}, ${world.matchTwoId}`);
  console.log(`Teams: ${world.teamAId}, ${world.teamBId}`);
  console.log(
    `Players: ${world.playerA1}, ${world.playerA2}, ${world.playerA3}, ${world.playerB1}, ${world.playerB2}`,
  );
  console.log("Remove it later from the Supabase SQL editor (safe to re-run):");
  console.log(KEPT_WORLD_CLEANUP_SQL);
}
