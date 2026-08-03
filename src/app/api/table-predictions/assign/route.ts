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

  const genericSaveError = () =>
    NextResponse.json(
      {
        error: "That move didn't save -- check your connection and try again.",
      },
      { status: 500 },
    );

  // Retries the select-max-rank -> insert cycle a few times, so a losing
  // side of a race (two requests reading the same "current ranks" snapshot
  // before either writes) recomputes against fresh data instead of
  // silently giving up. Two distinct races land here:
  //  1. The same team, twice (a fast double-tap) -> the second attempt's
  //     insert 23505s on team_id; once we see the row exists, we're done.
  //  2. Two different teams whose computed predicted_rank happened to
  //     collide -> the insert 23505s on predicted_rank instead; the losing
  //     request just needs to recompute a fresh rank and retry its own
  //     insert, since its own team_id row still doesn't exist yet.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existingRanks, error: ranksError } = await supabase
      .from("table_prediction_ranks")
      .select("id, team_id, predicted_rank")
      .eq("table_prediction_id", prediction.id);
    if (ranksError) return genericSaveError();

    const existing = existingRanks?.find((rank) => rank.team_id === teamId);
    if (existing) {
      const { error: updateError } = await supabase
        .from("table_prediction_ranks")
        .update({ band })
        .eq("id", existing.id);
      if (updateError) return genericSaveError();
      return NextResponse.json({ ok: true });
    }

    // The smallest rank 1-20 not currently in use -- not "max + 1". Ranks
    // are never renumbered when a row is deleted (unassign), so always
    // incrementing would eventually walk past 20 and start failing the
    // `predicted_rank between 1 and 20` check constraint after enough
    // remove-then-recall cycles. There are at most 19 other rows at this
    // point (this team doesn't have one yet), so a free slot in 1-20
    // always exists.
    const usedRanks = new Set(
      (existingRanks ?? []).map((rank) => rank.predicted_rank),
    );
    let nextRank = 1;
    while (usedRanks.has(nextRank)) nextRank++;
    const { error: insertError } = await supabase
      .from("table_prediction_ranks")
      .insert({
        table_prediction_id: prediction.id,
        team_id: teamId,
        band,
        predicted_rank: nextRank,
      });
    if (!insertError) return NextResponse.json({ ok: true });

    if (insertError.code === "23503") {
      // Foreign-key violation -> the given teamId doesn't exist.
      return NextResponse.json(
        {
          error:
            "That doesn't look like a real team -- try refreshing the page.",
        },
        { status: 400 },
      );
    }
    if (insertError.code !== "23505") return genericSaveError();
    // 23505 (unique violation) -> loop and recheck: either our own team_id
    // now has a row (case 1, handled by the `existing` branch above on the
    // next pass) or the rank collided with a different team (case 2,
    // resolved by recomputing nextRank on the next pass).
  }

  return genericSaveError();
}
