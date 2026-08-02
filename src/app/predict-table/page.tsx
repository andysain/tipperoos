import { redirect } from "next/navigation";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import {
  getGameweekOneKickoff,
  getPlayerForTablePrediction,
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
  const playerId = await getSessionPlayerId();
  if (!playerId) {
    redirect("/login");
  }

  const supabase = createServerSupabaseClient();

  const player = await getPlayerForTablePrediction(supabase, playerId);

  if (!player) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <p className="text-danger">
          Couldn&apos;t load your player record. Try refreshing.
        </p>
      </main>
    );
  }

  const [{ data: teams, error: teamsError }, gameweekOneKickoff] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, name, short_code")
        .eq("active", true)
        .order("name", { ascending: true }),
      getGameweekOneKickoff(supabase),
    ]);

  if (teamsError || !teams) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <p className="text-danger">
          Couldn&apos;t load the teams. Try refreshing.
        </p>
      </main>
    );
  }

  const editability = getTablePredictionEditability({
    joinedAt: player.joinedAt,
    now: new Date(),
    gameweekOneKickoff,
  });

  const { data: prediction } = await supabase
    .from("table_predictions")
    .select("id, is_skipped, submitted_at")
    .eq("player_id", playerId)
    .maybeSingle();

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
        shortCode: team.short_code,
      }))}
      initialAssignments={assignments}
      isLateJoiner={editability.isLateJoiner}
      locked={editability.locked}
      initialIsSkipped={prediction?.is_skipped ?? false}
      initialSubmittedAt={prediction?.submitted_at ?? null}
    />
  );
}
