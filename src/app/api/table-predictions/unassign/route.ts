import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recomputeCohortForPlayer } from "@/app/_lib/predict-table-recompute-trigger";

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
  const { data, error } = await supabase.rpc("table_prediction_unassign", {
    p_player_id: playerId,
    p_team_id: teamId,
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
  await recomputeCohortForPlayer(supabase, playerId);

  return NextResponse.json({ ok: true });
}
