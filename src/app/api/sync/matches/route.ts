import { NextResponse } from "next/server";
import { mapMatchesToUpdates } from "@/lib/matches/map-matches";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { scoreCompletedMatchesAndSnapshots } from "@/lib/gameweeks/sync-scoring";
import { generateBotPicks } from "@/lib/bots/generate";
import { selectNextGameweekSlots } from "@/lib/gameweeks/select-next";
import { getCurrentSeasonId } from "@/app/_lib/gameweek-access";

// Issue #11: fixture/result sync route, callable manually now and by this
// issue's own GitHub Actions workflow on a schedule. Mirrors #88's standings
// route (src/app/api/sync/standings/route.ts) -- same header-secret auth
// (no other route shape fits a server-to-server caller), same sync_log shape.
const SYNC_TRIGGER_HEADER = "x-sync-secret";
const PROVIDER_NAME = "football-data.org";
const WINDOW_DAYS = 10;
// A same-day-only lower bound missed any match whose result lands after the
// last run of the day (the cron stops at 23:59 UTC) or after a gap in runs
// (e.g. a day nobody dispatched staging) -- the next run's dateFrom had
// already slid past it, and every later run's window keeps sliding forward,
// so that match's kickoff/result never gets picked up again.
const LOOKBACK_DAYS = 2;

function hasValidSyncSecret(request: Request): boolean {
  const expected = process.env.SYNC_TRIGGER_SECRET;
  if (!expected) return false;
  return request.headers.get(SYNC_TRIGGER_HEADER) === expected;
}

function dateRange(now: Date) {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - LOOKBACK_DAYS);
  const dateFrom = from.toISOString().slice(0, 10);
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

/**
 * Runs one post-sync step in its own failure domain (issue #166 D5, extended
 * by #35 D3). Three rules, identical for every step, which is why this is a
 * helper rather than a third copy of the same try/catch:
 *
 * - A step's failure never touches the "matches" sync_log row, another
 *   step's row, or this route's HTTP status. The fixture/result sync
 *   genuinely succeeded regardless of what our own downstream computation
 *   does.
 * - No success row when the step did nothing (`work` returns 0). Most cycles
 *   land between kickoffs with every bot pick already filed, and a success
 *   row every 30 minutes would bury the entries that matter.
 * - The caller gets a bare flag, never the caught message. A raw
 *   Postgres/PostgREST error can carry constraint, column or row-identifier
 *   fragments; the detail stays in sync_log, matching the outer catch's own
 *   "detail in sync_log, generic to caller" convention.
 *
 * @param work returns how many units it did; 0 means "nothing to report".
 * @returns true if the step failed.
 */
async function runIsolatedStep(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  syncType: "bots" | "scoring" | "selection",
  work: () => Promise<number>,
): Promise<boolean> {
  try {
    const done = await work();
    if (done > 0) {
      await supabase.from("sync_log").insert({
        provider_name: PROVIDER_NAME,
        sync_type: syncType,
        status: "success",
        error_message: null,
      });
    }
    return false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("sync_log").insert({
      provider_name: PROVIDER_NAME,
      sync_type: syncType,
      status: "failure",
      error_message: message,
    });
    return true;
  }
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

  type MapResult = ReturnType<typeof mapMatchesToUpdates>;
  let updates: MapResult["updates"] = [];
  let unmatchedProviderMatchIds: MapResult["unmatchedProviderMatchIds"] = [];
  let matchesFailed = false;
  let matchesErrorMessage = "";

  try {
    // Issue #182: an unscoped, unordered select here grows with every
    // season (~380 rows/season) and would silently truncate past Supabase's
    // configured 1,000-row cap around season 2-3 -- a dropped
    // provider_match_id -> id mapping means that match stops syncing kickoff/
    // result changes with no error. Scoping to the current season keeps this
    // at ~380 rows regardless of how many past seasons accumulate. Falls
    // back to unscoped only if no season is flagged current (shouldn't
    // happen -- CLAUDE.md's seasons.is_current default -- but a sync outage
    // is worse than a wide query here).
    const currentSeasonId = await getCurrentSeasonId(supabase);
    let matchesQuery = supabase
      .from("matches")
      .select("id, provider_match_id")
      .eq("provider_name", PROVIDER_NAME)
      .order("id", { ascending: true });
    if (currentSeasonId) {
      matchesQuery = matchesQuery.eq("season_id", currentSeasonId);
    }

    const [matchesResponse, knownMatchesResult] = await Promise.all([
      fetchMatches(apiKey, dateFrom, dateTo),
      matchesQuery,
    ]);

    if (knownMatchesResult.error) throw knownMatchesResult.error;

    const matchIdByProviderMatchId = new Map(
      knownMatchesResult.data.map((row) => [row.provider_match_id, row.id]),
    );

    ({ updates, unmatchedProviderMatchIds } = mapMatchesToUpdates(
      matchesResponse,
      matchIdByProviderMatchId,
      now,
    ));

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
      matches_updated: updates.length,
      error_message: errorMessage,
    });
  } catch (err) {
    matchesFailed = true;
    matchesErrorMessage = err instanceof Error ? err.message : String(err);
    await supabase.from("sync_log").insert({
      provider_name: PROVIDER_NAME,
      sync_type: "matches",
      status: "failure",
      error_message: matchesErrorMessage,
    });
  }

  // Issue #35 D3: bot pick generation, on the same cadence and with the same
  // failure isolation as the scoring step below. Two things it is
  // deliberately NOT gated on:
  //
  // - `completedMatchIds.length > 0`. Random and 1-1 bots must file while
  //   their match is still days away, on cycles where nothing has completed.
  // - The provider fetch succeeding. Bots read gameweeks and matches from
  //   our own DB and need nothing from football-data.org, so running this
  //   inside the try above would mean an outage across a pre-lock window
  //   (only ~4 usable cycles before a Saturday morning kickoff, given
  //   sync.yml's 10-23 UTC schedule) left the Random and 1-1 bots with no
  //   pick for that match FOREVER -- once it locks they are skipped, and D5
  //   is write-once so nothing backfills them. The Median Bot self-heals;
  //   those two do not.
  //
  // It still runs after the matches update on a good cycle, so it sees this
  // cycle's kickoff-time changes rather than last cycle's.
  const botsFailed = await runIsolatedStep(supabase, "bots", () =>
    generateBotPicks(supabase),
  );

  if (matchesFailed) {
    return NextResponse.json(
      {
        error: "Matches sync failed -- see sync_log.",
        ...(botsFailed
          ? { botsError: "Bot pick generation failed -- see sync_log." }
          : {}),
      },
      { status: 500 },
    );
  }

  // Issue #166 D5: scoring/snapshot failures never touch the "matches"
  // sync_log row above or this route's response status -- the fixture/
  // result sync itself genuinely succeeded regardless of whether our own
  // downstream computation does. Own try/catch, own sync_log entry.
  const completedMatchIds = updates
    .filter((u) => u.status === "completed")
    .map((u) => u.id);

  const scoringFailed = await runIsolatedStep(supabase, "scoring", async () => {
    if (completedMatchIds.length === 0) return 0;
    await scoreCompletedMatchesAndSnapshots(supabase, completedMatchIds);
    return 1;
  });

  // Issue #92 D3: next-gameweek Tipped Match selection, placed after scoring
  // so it sees this cycle's newly-completed matches feed straight into
  // isGameweekScoringComplete. Own failure domain, own sync_log entry --
  // never touches the "matches" or "scoring" rows above.
  const selectionFailed = await runIsolatedStep(supabase, "selection", () =>
    selectNextGameweekSlots(supabase),
  );

  return NextResponse.json({
    updated: updates.length,
    skipped: unmatchedProviderMatchIds,
    ...(botsFailed
      ? { botsError: "Bot pick generation failed -- see sync_log." }
      : {}),
    ...(scoringFailed
      ? { scoringError: "Scoring failed -- see sync_log." }
      : {}),
    ...(selectionFailed
      ? { selectionError: "Selection failed -- see sync_log." }
      : {}),
  });
}
