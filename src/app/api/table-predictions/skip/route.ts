import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import {
  getGameweekOneKickoff,
  getPlayerForTablePrediction,
} from "@/app/_lib/table-prediction-access";
import { isLateJoiner } from "@/lib/table-predictions/rules";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Skipping is only offered to Late Joiners -- on-time players' capture is
// mandatory (CLAUDE.md -> "Late joiners"). Unlike submit, skipping has no
// lock check: a Late Joiner can skip "at any time after joining."
export async function POST(request: Request) {
  if (!hasCsrfHeader(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const playerId = await getSessionPlayerId();
  if (!playerId) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  // Independent of each other -- neither reads the other's result -- so run
  // together instead of serially (PERFORMANCE_TESTING_STANDARD.md item #5).
  const [player, gameweekOneKickoff] = await Promise.all([
    getPlayerForTablePrediction(supabase, playerId),
    getGameweekOneKickoff(supabase),
  ]);
  if (!player) {
    return NextResponse.json(
      { error: "Couldn't find your player profile -- try logging in again." },
      { status: 500 },
    );
  }

  const lateJoiner = isLateJoiner(player.joinedAt, gameweekOneKickoff);
  if (!lateJoiner) {
    return NextResponse.json(
      {
        error:
          "Only players who joined after Gameweek 1 began can skip -- yours is mandatory.",
      },
      { status: 403 },
    );
  }

  const { error: upsertError } = await supabase
    .from("table_predictions")
    .upsert(
      { player_id: playerId, is_skipped: true, submitted_at: null },
      { onConflict: "player_id" },
    );
  if (upsertError) {
    return NextResponse.json(
      { error: "Couldn't skip -- check your connection and try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
