import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import { isBandKey } from "@/lib/table-predictions/rules";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recomputeCohortForPlayer } from "@/app/_lib/predict-table-recompute-trigger";

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
  const { data, error } = await supabase.rpc("table_prediction_assign", {
    p_player_id: playerId,
    p_team_id: teamId,
    p_band: band,
  });
  const result = Array.isArray(data) ? data[0] : data;

  if (error || !result) {
    return NextResponse.json(
      {
        error: "That move didn't save -- check your connection and try again.",
      },
      { status: 500 },
    );
  }
  if (result.result === "locked") {
    return NextResponse.json(
      { error: "Predict the Table is locked after 31 August." },
      { status: 403 },
    );
  }
  if (result.result === "player_not_found") {
    return NextResponse.json(
      { error: "Couldn't find your player profile -- try logging in again." },
      { status: 500 },
    );
  }
  if (result.result === "invalid_team") {
    return NextResponse.json(
      {
        error: "That doesn't look like a real team -- try refreshing the page.",
      },
      { status: 400 },
    );
  }
  await recomputeCohortForPlayer(supabase, playerId);

  return NextResponse.json({ ok: true });
}
