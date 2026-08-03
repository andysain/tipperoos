import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import {
  getPlayerForTablePrediction,
  getTablePredictionEditabilityForPlayer,
} from "@/app/_lib/table-prediction-access";
import {
  type BandKey,
  validateBandCounts,
} from "@/lib/table-predictions/rules";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Marks the current band assignment as submitted -- re-submittable any
// number of times until Gameweek 1's first kickoff (CLAUDE.md). Requires
// every Band to exactly match its target size first (the "flagged and fixed
// via tap-team -> move-to-Band ... before submission is allowed" rule from
// docs/adr/0003-predict-the-table-shape.md).
export async function POST(request: Request) {
  if (!hasCsrfHeader(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const playerId = await getSessionPlayerId();
  if (!playerId) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
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
    return NextResponse.json(
      { error: "Sort some teams into Bands before submitting." },
      { status: 400 },
    );
  }

  const { data: ranks, error: ranksError } = await supabase
    .from("table_prediction_ranks")
    .select("band")
    .eq("table_prediction_id", prediction.id);
  if (ranksError) {
    return NextResponse.json(
      { error: "Couldn't load your table prediction -- try again." },
      { status: 500 },
    );
  }

  const counts: Partial<Record<BandKey, number>> = {};
  for (const rank of ranks ?? []) {
    const band = rank.band as BandKey;
    counts[band] = (counts[band] ?? 0) + 1;
  }

  const validation = validateBandCounts(counts);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Every Band needs to match its target size before submitting.",
        mismatches: validation.mismatches,
        unsortedCount: validation.unsortedCount,
      },
      { status: 400 },
    );
  }

  const submittedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("table_predictions")
    .update({ submitted_at: submittedAt, is_skipped: false })
    .eq("id", prediction.id);
  if (updateError) {
    return NextResponse.json(
      { error: "Couldn't submit -- check your connection and try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ submittedAt });
}
