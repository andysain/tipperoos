// Scripted simulation for issue #71 (TESTING_STANDARD.md §1b): proves
// scoresForCompetition/picksForMatch never leak one competition's data into
// another's view, by seeding two competitions that tip the SAME real-world
// match (the exact scenario the shared helper module exists to guard
// against) and asserting each competition's read only ever sees its own
// players' rows.
//
// Runs against a local Supabase stack (`supabase start`), not staging --
// disposable, no seeded junk in a shared project, no credentials to hand to
// CI. Not a CI gate; run manually before trusting src/lib/competitions/scope.ts
// against real data, and again after any change to it.
//
// This re-implements the same query shapes as scope.ts rather than
// importing it directly, because scope.ts is guarded by `import
// "server-only"` (throws outside a Next.js server bundle) -- same
// constraint and precedent as scripts/set-competition-code.mjs.
//
// Usage:
//   supabase start
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<local service_role key from `supabase status`> \
//   node scripts/verify-competition-scope-isolation.mjs

import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const supabase = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

let failures = 0;
function assert(condition, message) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

async function scoresForCompetition(competitionId, seasonId) {
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, display_name")
    .eq("competition_id", competitionId);
  if (playersError) throw playersError;
  const playerIds = players.map((p) => p.id);
  if (playerIds.length === 0) return [];

  const { data: scoreRows, error: scoresError } = await supabase
    .from("scores")
    .select("player_id, points, matches!inner(season_id)")
    .in("player_id", playerIds)
    .eq("matches.season_id", seasonId);
  if (scoresError) throw scoresError;

  return players.map((p) => ({
    playerId: p.id,
    displayName: p.display_name,
    points: scoreRows
      .filter((r) => r.player_id === p.id)
      .reduce((sum, r) => sum + r.points, 0),
  }));
}

async function picksForCompetition(matchId, competitionId) {
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, display_name")
    .eq("competition_id", competitionId);
  if (playersError) throw playersError;
  const playerIds = players.map((p) => p.id);
  if (playerIds.length === 0) return [];

  const { data: pickRows, error: picksError } = await supabase
    .from("picks")
    .select("player_id, pred_home_score, pred_away_score")
    .eq("match_id", matchId)
    .in("player_id", playerIds);
  if (picksError) throw picksError;

  return players.map((p) => ({
    playerId: p.id,
    displayName: p.display_name,
    pick: pickRows.find((r) => r.player_id === p.id) ?? null,
  }));
}

async function main() {
  const cleanupIds = { competitions: [], seasons: [], matches: [], teams: [] };

  try {
    const { data: season } = await supabase
      .from("seasons")
      .insert({
        label: `verify-scope-${Date.now()}`,
        start_date: "2026-08-01",
        end_date: "2027-05-31",
      })
      .select("id")
      .single();
    cleanupIds.seasons.push(season.id);

    const { data: teams } = await supabase
      .from("teams")
      .insert([
        {
          name: `Verify Scope Team A ${Date.now()}`,
          provider_name: "verify-scope",
          provider_team_id: `A-${Date.now()}`,
        },
        {
          name: `Verify Scope Team B ${Date.now()}`,
          provider_name: "verify-scope",
          provider_team_id: `B-${Date.now()}`,
        },
      ])
      .select("id");
    cleanupIds.teams.push(...teams.map((t) => t.id));

    // The shared fixture -- both competitions tip this SAME match_id.
    const { data: match } = await supabase
      .from("matches")
      .insert({
        season_id: season.id,
        provider_name: "verify-scope",
        provider_match_id: `M-${Date.now()}`,
        team_a_id: teams[0].id,
        team_b_id: teams[1].id,
        kickoff_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // past, locked
        status: "completed",
        team_a_score: 2,
        team_b_score: 1,
      })
      .select("id")
      .single();
    cleanupIds.matches.push(match.id);

    const { data: competitions } = await supabase
      .from("competitions")
      .insert([
        { name: `Verify Scope Comp A ${Date.now()}`, code_hash: "unused" },
        { name: `Verify Scope Comp B ${Date.now()}`, code_hash: "unused" },
      ])
      .select("id");
    cleanupIds.competitions.push(...competitions.map((c) => c.id));
    const [compA, compB] = competitions;

    const { data: players } = await supabase
      .from("players")
      .insert([
        {
          competition_id: compA.id,
          display_name: "A Player",
          pin_hash: "unused",
        },
        {
          competition_id: compB.id,
          display_name: "B Player",
          pin_hash: "unused",
        },
      ])
      .select("id, competition_id");
    const playerA = players.find((p) => p.competition_id === compA.id);
    const playerB = players.find((p) => p.competition_id === compB.id);

    await supabase.from("picks").insert([
      {
        player_id: playerA.id,
        match_id: match.id,
        pred_home_score: 2,
        pred_away_score: 1,
      },
      {
        player_id: playerB.id,
        match_id: match.id,
        pred_home_score: 0,
        pred_away_score: 0,
      },
    ]);

    await supabase.from("scores").insert([
      { player_id: playerA.id, match_id: match.id, points: 9 },
      { player_id: playerB.id, match_id: match.id, points: 3 },
    ]);

    // --- Assertions ---

    const scoresA = await scoresForCompetition(compA.id, season.id);
    const scoresB = await scoresForCompetition(compB.id, season.id);

    assert(
      scoresA.length === 1 && scoresA[0].playerId === playerA.id,
      "scoresForCompetition(compA) returns only compA's player",
    );
    assert(
      scoresA[0]?.points === 9,
      "scoresForCompetition(compA) sums compA's own points (9), not compB's",
    );
    assert(
      scoresB.length === 1 && scoresB[0].playerId === playerB.id,
      "scoresForCompetition(compB) returns only compB's player",
    );
    assert(
      scoresB[0]?.points === 3,
      "scoresForCompetition(compB) sums compB's own points (3), not compA's",
    );

    const picksA = await picksForCompetition(match.id, compA.id);
    const picksB = await picksForCompetition(match.id, compB.id);

    assert(
      picksA.length === 1 && picksA[0].pick?.pred_home_score === 2,
      "picksForCompetition(match, compA) returns only compA's pick (2-1)",
    );
    assert(
      picksB.length === 1 && picksB[0].pick?.pred_home_score === 0,
      "picksForCompetition(match, compB) returns only compB's pick (0-0), not compA's",
    );
    assert(
      !picksA.some((p) => p.playerId === playerB.id) &&
        !picksB.some((p) => p.playerId === playerA.id),
      "neither competition's pick reveal contains the other competition's player",
    );
  } finally {
    await supabase.from("scores").delete().in("match_id", cleanupIds.matches);
    await supabase.from("picks").delete().in("match_id", cleanupIds.matches);
    await supabase
      .from("players")
      .delete()
      .in("competition_id", cleanupIds.competitions);
    await supabase
      .from("competitions")
      .delete()
      .in("id", cleanupIds.competitions);
    await supabase.from("matches").delete().in("id", cleanupIds.matches);
    await supabase.from("teams").delete().in("id", cleanupIds.teams);
    await supabase.from("seasons").delete().in("id", cleanupIds.seasons);
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll competition-scope isolation checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
