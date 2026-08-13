// One-off seed script for issue #5: pulls the current PL season's teams and
// all fixtures from football-data.org and upserts them into Supabase.
// Run manually, once per environment -- NOT part of the recurring sync job.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... FOOTBALL_DATA_API_KEY=... node scripts/seed-fixtures.mjs

import { createClient } from "@supabase/supabase-js";
import {
  requireEnv,
  createFootballDataClient,
} from "./lib/football-data-client.mjs";
import { displayName, shortName } from "./lib/team-names.mjs";

const FOOTBALL_DATA_API_KEY = requireEnv("FOOTBALL_DATA_API_KEY");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const PROVIDER_NAME = "football-data.org";

const fetchFromFootballData = createFootballDataClient(FOOTBALL_DATA_API_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const competition = await fetchFromFootballData("/competitions/PL");
  const season = competition.currentSeason;
  console.log(`Season ${season.startDate} -> ${season.endDate}`);

  const { error: seasonError } = await supabase
    .from("seasons")
    .update({ start_date: season.startDate, end_date: season.endDate })
    .eq("is_current", true);
  if (seasonError) throw seasonError;

  const teamsResp = await fetchFromFootballData("/competitions/PL/teams");
  const teamRows = teamsResp.teams.map((t) => ({
    full_name: t.name,
    name: shortName(t.name),
    display_name: displayName(shortName(t.name)),
    short_code: t.tla,
    crest_url: t.crest,
    provider_name: PROVIDER_NAME,
    provider_team_id: String(t.id),
  }));
  const { error: teamsError } = await supabase
    .from("teams")
    .upsert(teamRows, { onConflict: "provider_name,provider_team_id" });
  if (teamsError) throw teamsError;
  console.log(`Upserted ${teamRows.length} teams.`);

  const { data: teams, error: teamsFetchError } = await supabase
    .from("teams")
    .select("id, provider_team_id")
    .eq("provider_name", PROVIDER_NAME);
  if (teamsFetchError) throw teamsFetchError;
  const teamIdByProviderId = new Map(
    teams.map((t) => [t.provider_team_id, t.id]),
  );

  const { data: seasonRow, error: seasonFetchError } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .single();
  if (seasonFetchError) throw seasonFetchError;

  const matchesResp = await fetchFromFootballData("/competitions/PL/matches");
  const statusMap = {
    SCHEDULED: "scheduled",
    TIMED: "scheduled",
    POSTPONED: "postponed",
    FINISHED: "completed",
  };
  const matchRows = matchesResp.matches.map((m) => ({
    season_id: seasonRow.id,
    provider_name: PROVIDER_NAME,
    provider_match_id: String(m.id),
    team_a_id: teamIdByProviderId.get(String(m.homeTeam.id)),
    team_b_id: teamIdByProviderId.get(String(m.awayTeam.id)),
    kickoff_time: m.utcDate,
    status: statusMap[m.status] ?? "scheduled",
    team_a_score: m.score?.fullTime?.home ?? null,
    team_b_score: m.score?.fullTime?.away ?? null,
  }));

  const missingTeam = matchRows.find((m) => !m.team_a_id || !m.team_b_id);
  if (missingTeam) {
    throw new Error(
      `Match ${missingTeam.provider_match_id} references an unknown team.`,
    );
  }

  const { error: matchesError } = await supabase
    .from("matches")
    .upsert(matchRows, { onConflict: "provider_name,provider_match_id" });
  if (matchesError) throw matchesError;
  console.log(`Upserted ${matchRows.length} matches.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
