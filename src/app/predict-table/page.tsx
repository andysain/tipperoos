import { loadActivePlayer } from "@/app/_lib/session-player";
import {
  getGameweekOneKickoff,
  getDatabaseTime,
  getPlayerForTablePrediction,
  getTablePredictionRecord,
} from "@/app/_lib/table-prediction-access";
import {
  type BandKey,
  getTablePredictionEditability,
} from "@/lib/table-predictions/rules";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PredictTableFlow } from "./PredictTableFlow";

// Reads the session + DB fresh on every request -- this is a personalized,
// lock-time-sensitive page, not something that can be statically cached.
export const dynamic = "force-dynamic";

export default async function PredictTablePage() {
  // Forced-reset gate first (issue #36).
  const { playerId } = await loadActivePlayer();

  const supabase = createServerSupabaseClient();

  // None of these five reads depends on another's result -- player,
  // prediction and databaseTime are keyed only on playerId/DB clock,
  // gameweekOneKickoff and the teams list are global -- so all five run in
  // one wave instead of player/teams+gameweekOneKickoff+databaseTime/
  // prediction as three serial stages.
  // See docs/standards/PERFORMANCE_TESTING_STANDARD.md §4.4.
  const [
    player,
    { data: teams, error: teamsError },
    gameweekOneKickoff,
    databaseTime,
    prediction,
  ] = await Promise.all([
    getPlayerForTablePrediction(supabase, playerId),
    supabase
      .from("teams")
      .select("id, name, display_name, short_code, previous_season_position")
      .eq("active", true)
      .order("name", { ascending: true }),
    getGameweekOneKickoff(supabase),
    getDatabaseTime(supabase),
    getTablePredictionRecord(supabase, playerId),
  ]);

  if (!player) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <p className="text-danger">
          Couldn&apos;t load your player record. Try refreshing.
        </p>
      </main>
    );
  }

  if (teamsError || !teams) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <p className="text-danger">
          Couldn&apos;t load the teams. Try refreshing.
        </p>
      </main>
    );
  }

  if (!databaseTime) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <p className="text-danger">
          Couldn&apos;t confirm the deadline. Try refreshing.
        </p>
      </main>
    );
  }

  const editability = getTablePredictionEditability({
    joinedAt: player.joinedAt,
    now: databaseTime,
    gameweekOneKickoff,
  });

  let assignments: Record<string, BandKey> = {};
  if (prediction) {
    const { data: ranks } = await supabase
      .from("table_prediction_ranks")
      .select("team_id, band")
      .eq("table_prediction_id", prediction.id);
    assignments = Object.fromEntries(
      (ranks ?? []).map((rank) => [rank.team_id, rank.band as BandKey]),
    );
  }

  return (
    <PredictTableFlow
      teams={teams.map((team) => ({
        id: team.id,
        name: team.name,
        displayName: team.display_name,
        shortCode: team.short_code,
        previousSeasonPosition: team.previous_season_position,
      }))}
      initialAssignments={assignments}
      isLateJoiner={editability.isLateJoiner}
      locked={editability.locked}
      initialIsSkipped={prediction?.skipped ?? false}
      initialSubmittedAt={prediction?.submittedAt ?? null}
    />
  );
}
