import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import {
  getPlayerForTablePrediction,
  getTablePredictionEditabilityForPlayer,
} from "@/app/_lib/table-prediction-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface UnassignBody {
  teamId?: unknown;
}

// Sends a placed team back to the unsorted pool -- tapping any already
// -placed team removes it (product decision during issue #26, replacing
// the earlier "select a team, then pick a new Band" flow). Deletes the
// row outright rather than nulling a band column: absence of a row *is*
// "unsorted" everywhere else in this feature (see assign/route.ts).
export async function POST(request: Request) {
  if (!hasCsrfHeader(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const playerId = await getSessionPlayerId();
  if (!playerId) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  let body: UnassignBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const teamId = typeof body.teamId === "string" ? body.teamId : "";
  if (!teamId) {
    return NextResponse.json(
      { error: "A valid teamId is required." },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseClient();

  const player = await getPlayerForTablePrediction(supabase, playerId);
  if (!player) {
    return NextResponse.json(
      { error: "Couldn't find your player profile -- try logging in again." },
      { status: 500 },
    );
  }

  const editability = await getTablePredictionEditabilityForPlayer(supabase, {
    joinedAt: player.joinedAt,
    now: new Date(),
  });
  if (!editability.editable) {
    return NextResponse.json(
      {
        error:
          "Predict the Table has locked now that Gameweek 1 has kicked off.",
      },
      { status: 403 },
    );
  }

  const { data: prediction, error: predictionError } = await supabase
    .from("table_predictions")
    .select("id")
    .eq("player_id", playerId)
    .maybeSingle();
  if (predictionError) {
    return NextResponse.json(
      { error: "Couldn't load your table prediction -- try again." },
      { status: 500 },
    );
  }
  if (!prediction) {
    return NextResponse.json({ ok: true });
  }

  const { error: deleteError } = await supabase
    .from("table_prediction_ranks")
    .delete()
    .eq("table_prediction_id", prediction.id)
    .eq("team_id", teamId);
  if (deleteError) {
    return NextResponse.json(
      {
        error: "That move didn't save -- check your connection and try again.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
