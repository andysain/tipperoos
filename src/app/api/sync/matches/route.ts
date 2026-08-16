import { NextResponse } from "next/server";
import { mapMatchesToUpdates } from "@/lib/matches/map-matches";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { scoreCompletedMatchesAndSnapshots } from "@/lib/gameweeks/sync-scoring";
import { generateBotPicks } from "@/lib/bots/generate";

// Issue #11: fixture/result sync route, callable manually now and by this
// issue's own GitHub Actions workflow on a schedule. Mirrors #88's standings
// route (src/app/api/sync/standings/route.ts) -- same header-secret auth
// (no other route shape fits a server-to-server caller), same sync_log shape.
const SYNC_TRIGGER_HEADER = "x-sync-secret";
const PROVIDER_NAME = "football-data.org";
const WINDOW_DAYS = 10;

function hasValidSyncSecret(request: Request): boolean {
  const expected = process.env.SYNC_TRIGGER_SECRET;
  if (!expected) return false;
  return request.headers.get(SYNC_TRIGGER_HEADER) === expected;
}

function dateRange(now: Date) {
  const dateFrom = now.toISOString().slice(0, 10);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + WINDOW_DAYS);
  const dateTo = to.toISOString().slice(0, 10);
  return { dateFrom, dateTo };
}

async function fetchMatches(apiKey: string, dateFrom: string, dateTo: string) {
  const res = await fetch(
    `https://api.football-data.org/v4/competitions/PL/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    { headers: { "X-Auth-Token": apiKey } },
  );
  if (!res.ok) {
    throw new Error(
      `football-data.org matches fetch failed: ${res.status} ${await res.text()}`,
    );
  }
  return res.json();
}

export async function POST(request: Request) {
  if (!hasValidSyncSecret(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing FOOTBALL_DATA_API_KEY." },
      { status: 500 },
    );
  }

  const now = new Date();
  const { dateFrom, dateTo } = dateRange(now);

  try {
    const [matchesResponse, knownMatchesResult] = await Promise.all([
      fetchMatches(apiKey, dateFrom, dateTo),
      supabase
        .from("matches")
        .select("id, provider_match_id")
        .eq("provider_name", PROVIDER_NAME),
    ]);

    if (knownMatchesResult.error) throw knownMatchesResult.error;

    const matchIdByProviderMatchId = new Map(
      knownMatchesResult.data.map((row) => [row.provider_match_id, row.id]),
    );

    const { updates, unmatchedProviderMatchIds } = mapMatchesToUpdates(
      matchesResponse,
      matchIdByProviderMatchId,
      now,
    );

    // Fixtures are always pre-seeded (CLAUDE.md): every id here already
    // exists, so this is always an UPDATE, never an insert -- an upsert
    // fails here because Postgres validates NOT NULL columns (season_id,
    // team_a_id, team_b_id) on the proposed row even for an update-only
    // conflict resolution, and this route never has those values to send.
    const updateResults = await Promise.all(
      updates.map(({ id, ...changes }) =>
        supabase.from("matches").update(changes).eq("id", id),
      ),
    );
    const updateError = updateResults.find((result) => result.error)?.error;
    if (updateError) throw updateError;

    const errorMessage =
      unmatchedProviderMatchIds.length > 0
        ? `skipped ${unmatchedProviderMatchIds.length} unmatched fixtures: ${unmatchedProviderMatchIds.join(", ")}`
        : null;

    await supabase.from("sync_log").insert({
      provider_name: PROVIDER_NAME,
      sync_type: "matches",
      status: "success",
      error_message: errorMessage,
    });

    // Issue #35 D3: bot pick generation, on the same cadence and with the
    // same failure isolation as the scoring block below. Deliberately NOT
    // inside that block's `completedMatchIds.length > 0` gate -- Random and
    // 1-1 bots must file while their match is still days away, on cycles
    // where nothing has completed. Runs before scoring so a Median pick
    // created at lock is scored in the same cycle the match finishes; that
    // ordering is a nicety, not a correctness requirement, since #166 D1
    // recomputes from current state every cycle.
    let botsFailed = false;
    try {
      const generated = await generateBotPicks(supabase);
      // Same "no success row when there was nothing to do" rule as scoring:
      // most cycles generate nothing, and a row every 30 minutes would bury
      // the real entries.
      if (generated > 0) {
        await supabase.from("sync_log").insert({
          provider_name: PROVIDER_NAME,
          sync_type: "bots",
          status: "success",
          error_message: `generated ${generated} bot picks`,
        });
      }
    } catch (err) {
      botsFailed = true;
      const message = err instanceof Error ? err.message : String(err);
      await supabase.from("sync_log").insert({
        provider_name: PROVIDER_NAME,
        sync_type: "bots",
        status: "failure",
        error_message: message,
      });
    }

    // Issue #166 D5: scoring/snapshot failures never touch the "matches"
    // sync_log row above or this route's response status -- the fixture/
    // result sync itself genuinely succeeded regardless of whether our own
    // downstream computation does. Own try/catch, own sync_log entry.
    //
    // No "scoring" sync_log row at all when this cycle completed nothing --
    // most cycles land outside a match's final whistle, and a success row
    // every ~10-15 minutes with nothing to report would just be noise.
    const completedMatchIds = updates
      .filter((u) => u.status === "completed")
      .map((u) => u.id);

    // scoringFailed is a bare flag, not the caught message -- matches the
    // outer catch's convention below (generic response, detail in
    // sync_log only). A raw Postgres/PostgREST error can carry constraint,
    // column, or row-identifier fragments; no caller of this route needs
    // more than "check sync_log" to act on a scoring failure.
    let scoringFailed = false;
    try {
      if (completedMatchIds.length > 0) {
        await scoreCompletedMatchesAndSnapshots(supabase, completedMatchIds);
        await supabase.from("sync_log").insert({
          provider_name: PROVIDER_NAME,
          sync_type: "scoring",
          status: "success",
          error_message: null,
        });
      }
    } catch (err) {
      scoringFailed = true;
      const message = err instanceof Error ? err.message : String(err);
      await supabase.from("sync_log").insert({
        provider_name: PROVIDER_NAME,
        sync_type: "scoring",
        status: "failure",
        error_message: message,
      });
    }

    return NextResponse.json({
      updated: updates.length,
      skipped: unmatchedProviderMatchIds,
      ...(botsFailed
        ? { botsError: "Bot pick generation failed -- see sync_log." }
        : {}),
      ...(scoringFailed
        ? { scoringError: "Scoring failed -- see sync_log." }
        : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("sync_log").insert({
      provider_name: PROVIDER_NAME,
      sync_type: "matches",
      status: "failure",
      error_message: message,
    });
    return NextResponse.json(
      { error: "Matches sync failed -- see sync_log." },
      { status: 500 },
    );
  }
}
