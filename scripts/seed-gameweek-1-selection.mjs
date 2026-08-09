// One-off seed script for issue #89: selects gameweek 1's Match 1 (Top
// Matchup) and Match 2 (Random Pick) per docs/adr/0006-auto-selected-tipped-matches.md
// and writes the one `gameweeks` row for this competition/season. Gameweek 1
// has no previous gameweek to trigger selection from, so this runs once,
// manually, alongside seed-fixtures.mjs -- NOT part of the recurring sync job.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... FOOTBALL_DATA_API_KEY=... node scripts/seed-gameweek-1-selection.mjs
//
// Idempotent: if gameweek 1 already has match_1_id/match_2_id set for this
// competition/season, the script logs that and exits without recomputing --
// selectMatch2's random draw must never be re-rolled on a second run.

import { createClient } from "@supabase/supabase-js";
import { prompt } from "./lib/prompt.mjs";
import {
  requireEnv,
  createFootballDataClient,
} from "./lib/football-data-client.mjs";
import {
  selectTopMatchup,
  selectMatch2,
  chooseRankSource,
} from "./lib/match-selection.mjs";

const FOOTBALL_DATA_API_KEY = requireEnv("FOOTBALL_DATA_API_KEY");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const PROVIDER_NAME = "football-data.org";
const GAMEWEEK_NUMBER = 1;

const fetchFromFootballData = createFootballDataClient(FOOTBALL_DATA_API_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Postgres row order is arbitrary -- an unordered numbered list could mean a
// different competition between two runs with nothing on screen to reveal it
// (AGENTS.md's .order() non-negotiable).
async function selectCompetition(competitions) {
  if (competitions.length === 1) {
    return competitions[0];
  }

  console.log("Multiple competitions found:");
  competitions.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} (${c.id.slice(0, 8)})`);
  });

  const answer = await prompt(
    `Choose a competition (1-${competitions.length}): `,
  );
  const index = Number.parseInt(answer, 10) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= competitions.length) {
    throw new Error(`Invalid choice: "${answer}".`);
  }
  return competitions[index];
}

async function main() {
  const { data: competitions, error: competitionsError } = await supabase
    .from("competitions")
    .select("id, name")
    .order("created_at");
  if (competitionsError) throw competitionsError;
  if (competitions.length === 0) {
    throw new Error(
      "No competitions row found -- run bootstrap-competition.mjs first.",
    );
  }
  const competition = await selectCompetition(competitions);
  console.log(`Selecting gameweek 1 for competition "${competition.name}".`);

  const { data: seasonRow, error: seasonError } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .order("start_date")
    .single();
  if (seasonError) throw seasonError;

  // Idempotency guard: if this competition/season already has a gameweek 1
  // row with both slots set, stop before touching selectMatch2's random draw.
  const { data: existing, error: existingError } = await supabase
    .from("gameweeks")
    .select("id, match_1_id, match_2_id")
    .eq("competition_id", competition.id)
    .eq("season_id", seasonRow.id)
    .eq("number", GAMEWEEK_NUMBER)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && existing.match_1_id && existing.match_2_id) {
    console.log(
      `Gameweek 1 already selected for "${competition.name}" (gameweek id: ${existing.id}) -- nothing to do.`,
    );
    return;
  }
  // A row with only one slot set is unexpected -- nothing else writes to
  // `gameweeks` before this script runs. Refuse to guess rather than
  // silently recomputing and overwriting whatever produced that state.
  if (existing && (existing.match_1_id || existing.match_2_id)) {
    throw new Error(
      `Gameweek 1 row for "${competition.name}" (id: ${existing.id}) has only one slot set ` +
        `(match_1_id: ${existing.match_1_id}, match_2_id: ${existing.match_2_id}) -- refusing to recompute. ` +
        "Investigate and resolve manually.",
    );
  }

  // Gameweek 1's fixtures, by provider matchday -- `matches` has no
  // matchday/round column (it's never persisted from sync), so this asks
  // football-data.org directly rather than re-deriving it from kickoff
  // dates, which could misgroup postponed/rescheduled fixtures.
  const matchdayResp = await fetchFromFootballData(
    "/competitions/PL/matches?matchday=1",
  );
  const providerMatchIds = matchdayResp.matches.map((m) => String(m.id));
  if (providerMatchIds.length === 0) {
    throw new Error("football-data.org returned no matchday-1 fixtures.");
  }

  const { data: matchRows, error: matchesError } = await supabase
    .from("matches")
    .select("id, team_a_id, team_b_id, kickoff_time, provider_match_id")
    .eq("provider_name", PROVIDER_NAME)
    .in("provider_match_id", providerMatchIds);
  if (matchesError) throw matchesError;

  const missingIds = providerMatchIds.filter(
    (id) => !matchRows.some((m) => m.provider_match_id === id),
  );
  if (missingIds.length > 0) {
    throw new Error(
      `Gameweek 1 fixtures not found in \`matches\` -- run seed-fixtures.mjs first. Missing provider ids: ${missingIds.join(", ")}`,
    );
  }

  const fixtures = matchRows.map((m) => ({
    id: m.id,
    teamAId: m.team_a_id,
    teamBId: m.team_b_id,
    kickoffTime: new Date(m.kickoff_time),
    providerMatchId: m.provider_match_id,
  }));

  const teamIds = [...new Set(fixtures.flatMap((f) => [f.teamAId, f.teamBId]))];
  const { data: teamRows, error: teamsError } = await supabase
    .from("teams")
    .select("id, previous_season_position")
    .in("id", teamIds);
  if (teamsError) throw teamsError;
  const positions = teamRows.map((t) => ({
    teamId: t.id,
    position: t.previous_season_position,
  }));

  // No matches played yet this season -- chooseRankSource with an empty
  // playedCounts array always resolves to "previous_season" (ADR 0006).
  const rankSource = chooseRankSource({
    playedCounts: [],
    liveStandingsAvailable: false,
  });
  console.log(`Rank source: ${rankSource}.`);

  // Gameweek 1 has no previous gameweek, so nothing is excluded from the
  // Match 1 pool.
  const match1 = selectTopMatchup({
    fixtures,
    positions,
    previousMatch1TeamIds: [],
  });
  if (!match1) {
    throw new Error("selectTopMatchup returned no fixture.");
  }

  const match2 = selectMatch2({
    fixtures,
    match1FixtureId: match1.id,
    now: new Date(),
  });
  if (!match2) {
    throw new Error("selectMatch2 returned no fixture.");
  }

  const gameweekRow = {
    competition_id: competition.id,
    season_id: seasonRow.id,
    number: GAMEWEEK_NUMBER,
    match_1_id: match1.id,
    match_2_id: match2.id,
  };

  if (existing) {
    const { error: updateError } = await supabase
      .from("gameweeks")
      .update(gameweekRow)
      .eq("id", existing.id);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase
      .from("gameweeks")
      .insert(gameweekRow);
    if (insertError) throw insertError;
  }

  console.log(
    `Gameweek 1 selected for "${competition.name}": Match 1 = fixture ${match1.providerMatchId}, Match 2 = fixture ${match2.providerMatchId}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
