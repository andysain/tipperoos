// Incident-recovery script: restores team_standings for the current season
// from teams.previous_season_position, after football-data.org's pre-season
// placeholder table (every team at position 1 / 0 played) overwrote the
// real rows. The degenerate-snapshot guard in the standings sync route
// prevents that clobbering from recurring; this script repairs the damage
// already done.
//
// It is deliberately one-off: it writes last season's finishing positions
// as the *current* table (played = 0) until live results flow through the
// provider. Run it only to recover from the degenerate-data incident, not
// as a routine op -- once real standings exist, a normal sync overwrites
// these rows.
//
// Promoted clubs (null previous_season_position) get no row at all -- the
// Pick Board then shows no position for them, instead of the placeholder
// "1st". Their stale rows (if any) are deleted.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-standings-from-previous-season.mjs

import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./lib/football-data-client.mjs";
import { prompt } from "./lib/prompt.mjs";

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const { data: season, error: seasonError } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .single();
  if (seasonError) throw seasonError;

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, previous_season_position")
    .not("previous_season_position", "is", null);
  if (teamsError) throw teamsError;

  const withPosition = teams.map((team) => ({
    team_id: team.id,
    season_id: season.id,
    position: team.previous_season_position,
    played: 0,
    updated_at: new Date().toISOString(),
  }));

  const { data: allTeams, error: allTeamsError } = await supabase
    .from("teams")
    .select("id, previous_season_position");
  if (allTeamsError) throw allTeamsError;

  const promotedTeamIds = allTeams
    .filter((team) => team.previous_season_position === null)
    .map((team) => team.id);

  console.log(
    `Current season: ${season.id}\n` +
      `Backfilling ${withPosition.length} teams from previous_season_position.\n` +
      `Deleting stale standings rows for ${promotedTeamIds.length} promoted clubs (null previous_season_position).`,
  );

  const answer = await prompt("Continue? [y/N] ");
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
  }

  if (withPosition.length > 0) {
    const { error: upsertError } = await supabase
      .from("team_standings")
      .upsert(withPosition, { onConflict: "team_id,season_id" });
    if (upsertError) throw upsertError;
  }

  if (promotedTeamIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("team_standings")
      .delete()
      .eq("season_id", season.id)
      .in("team_id", promotedTeamIds);
    if (deleteError) throw deleteError;
  }

  console.log(
    `Done: ${withPosition.length} rows upserted, ${promotedTeamIds.length} promoted rows cleared.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
