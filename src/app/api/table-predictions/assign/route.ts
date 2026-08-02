import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import {
  getPlayerForTablePrediction,
  getTablePredictionEditabilityForPlayer,
} from "@/app/_lib/table-prediction-access";
import { isBandKey } from "@/lib/table-predictions/rules";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface AssignBody {
  teamId?: unknown;
  band?: unknown;
}

// Persists one team -> Band move immediately (CLAUDE.md: "Every move
// persists immediately (not just on final submit) -- safely resumable").
// A team already assigned just gets its band updated in place; predicted_rank
// is set once on first assignment (in the fixed team order the client
// presents cards in) and never reshuffled on later band moves -- it exists
// purely to satisfy the "always store the full 20-team ordering" storage
// principle, not as a real ranking signal (see
// docs/adr/0003-predict-the-table-shape.md: only Band membership scores).
export async function POST(request: Request) {
  if (!hasCsrfHeader(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const playerId = await getSessionPlayerId();
  if (!playerId) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  let body: AssignBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const teamId = typeof body.teamId === "string" ? body.teamId : "";
  const band = typeof body.band === "string" ? body.band : "";

  if (!teamId || !isBandKey(band)) {
    return NextResponse.json(
      { error: "A valid teamId and band are required." },
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
    .upsert(
      { player_id: playerId, is_skipped: false },
      { onConflict: "player_id" },
    )
    .select("id")
    .single();
  if (predictionError || !prediction) {
    return NextResponse.json(
      {
        error: "That move didn't save -- check your connection and try again.",
      },
      { status: 500 },
    );
  }

  const { data: existingRanks, error: ranksError } = await supabase
    .from("table_prediction_ranks")
    .select("id, team_id")
    .eq("table_prediction_id", prediction.id);
  if (ranksError) {
    return NextResponse.json(
      {
        error: "That move didn't save -- check your connection and try again.",
      },
      { status: 500 },
    );
  }

  const existing = existingRanks?.find((rank) => rank.team_id === teamId);

  if (existing) {
    const { error: updateError } = await supabase
      .from("table_prediction_ranks")
      .update({ band })
      .eq("id", existing.id);
    if (updateError) {
      return NextResponse.json(
        {
          error:
            "That move didn't save -- check your connection and try again.",
        },
        { status: 500 },
      );
    }
  } else {
    const nextRank = (existingRanks?.length ?? 0) + 1;
    const { error: insertError } = await supabase
      .from("table_prediction_ranks")
      .insert({
        table_prediction_id: prediction.id,
        team_id: teamId,
        band,
        predicted_rank: nextRank,
      });
    if (insertError) {
      // Foreign-key violation -> the given teamId doesn't exist.
      const status = insertError.code === "23503" ? 400 : 500;
      const message =
        status === 400
          ? "That doesn't look like a real team -- try refreshing the page."
          : "That move didn't save -- check your connection and try again.";
      return NextResponse.json({ error: message }, { status });
    }
  }

  return NextResponse.json({ ok: true });
}
