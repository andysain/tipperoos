import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Marks the current band assignment as submitted -- re-submittable any
// number of times until 31 August (CLAUDE.md). Submit never
// blocks on an untidy table; a wrongly-sized Band simply forfeits that
// Band's Bonus (docs/adr/0008-predict-the-table-group-fill-capture.md).
export async function POST(request: Request) {
  if (!hasCsrfHeader(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const playerId = await getSessionPlayerId();
  if (!playerId) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("table_prediction_submit", {
    p_player_id: playerId,
  });
  const result = Array.isArray(data) ? data[0] : data;

  if (error || !result) {
    return NextResponse.json(
      { error: "Couldn't submit -- check your connection and try again." },
      { status: 500 },
    );
  }
  if (result.result === "player_not_found") {
    return NextResponse.json(
      { error: "Couldn't find your player profile -- try logging in again." },
      { status: 500 },
    );
  }
  if (result.result === "locked") {
    return NextResponse.json(
      { error: "Predict the Table is locked after 31 August." },
      { status: 403 },
    );
  }
  if (result.result === "no_prediction") {
    return NextResponse.json(
      { error: "Sort some teams into Bands before submitting." },
      { status: 400 },
    );
  }

  return NextResponse.json({ submittedAt: result.submitted_at });
}
