import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import { isMatchLocked, resolveCompetitionId } from "@/lib/competitions/scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface SaveBody {
  matchId?: unknown;
  homeScore?: unknown;
  awayScore?: unknown;
}

const MIN_SCORE = 0;
const MAX_SCORE = 9; // digit-row entry only ever produces 0-9 per side.

function isValidScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_SCORE &&
    value <= MAX_SCORE
  );
}

function invalidScoreResponse() {
  return NextResponse.json(
    { error: "Enter a whole number from 0 to 9 for each side." },
    { status: 400 },
  );
}

// Saves and re-edits a pick (issue #15): upsert on (player_id, match_id), so
// filing and re-filing before lock are the same call. Lock enforcement
// (issue #16) reuses the same isMatchLocked predicate and DB-time pattern
// as picksForMatch's read-path enforcement (src/lib/competitions/scope.ts).
// Request/response bodies are camelCase, matching every other route in the
// repo.
export async function POST(request: Request) {
  if (!hasCsrfHeader(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const playerId = await getSessionPlayerId();
  if (!playerId) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  let body: SaveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const matchId = typeof body.matchId === "string" ? body.matchId : "";
  if (!matchId) {
    return NextResponse.json(
      { error: "A matchId is required." },
      { status: 400 },
    );
  }
  if (!isValidScore(body.homeScore) || !isValidScore(body.awayScore)) {
    return invalidScoreResponse();
  }

  const supabase = createServerSupabaseClient();

  // resolveCompetitionId returns null for a stale/unresolvable player id
  // (e.g. a signed cookie from a wiped dev database) -- routine, not
  // exceptional (see its own doc comment); treated the same as "not logged
  // in" here since there's no usable session either way.
  const competitionId = await resolveCompetitionId(supabase, playerId);
  if (!competitionId) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  // Competition-scoping the write (issue #15 decision 3): confirm matchId
  // is actually one of this competition's currently-tipped matches (a
  // gameweek's match_1_id or match_2_id), not just any match_id a client
  // might send. `picks`/`matches` carry no competition_id of their own --
  // `gameweeks` is the table that actually carries it, per
  // src/lib/competitions/scope.ts's established join-back pattern.
  const { data: gameweeks, error: gameweeksError } = await supabase
    .from("gameweeks")
    .select("match_1_id, match_2_id")
    .eq("competition_id", competitionId);
  if (gameweeksError) {
    return NextResponse.json(
      { error: "Couldn't verify that match -- try again." },
      { status: 500 },
    );
  }
  const isTippedMatch = (gameweeks ?? []).some(
    (gw) => gw.match_1_id === matchId || gw.match_2_id === matchId,
  );
  if (!isTippedMatch) {
    return NextResponse.json(
      { error: "That match isn't a currently tipped match." },
      { status: 400 },
    );
  }

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("kickoff_time")
    .eq("id", matchId)
    .single();
  if (matchError || !match) {
    return NextResponse.json(
      { error: "Couldn't verify that match -- try again." },
      { status: 500 },
    );
  }
  if (isMatchLocked(new Date(match.kickoff_time), new Date())) {
    return NextResponse.json(
      { error: "Picks lock 5 minutes before kickoff." },
      { status: 403 },
    );
  }

  const { data: pick, error: pickError } = await supabase
    .from("picks")
    .upsert(
      {
        player_id: playerId,
        match_id: matchId,
        pred_home_score: body.homeScore,
        pred_away_score: body.awayScore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id,match_id" },
    )
    .select("id, match_id, pred_home_score, pred_away_score, updated_at")
    .single();
  if (pickError || !pick) {
    return NextResponse.json(
      { error: "Couldn't save -- check your connection and try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    id: pick.id,
    matchId: pick.match_id,
    predHomeScore: pick.pred_home_score,
    predAwayScore: pick.pred_away_score,
    updatedAt: pick.updated_at,
  });
}
