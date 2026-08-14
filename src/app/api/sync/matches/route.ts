import { NextResponse } from "next/server";
import { mapMatchesToRows } from "@/lib/matches/map-matches";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
        .select("provider_match_id")
        .eq("provider_name", PROVIDER_NAME),
    ]);

    if (knownMatchesResult.error) throw knownMatchesResult.error;

    const knownProviderMatchIds = new Set(
      knownMatchesResult.data.map((row) => row.provider_match_id),
    );

    const { rows, unmatchedProviderMatchIds } = mapMatchesToRows(
      matchesResponse,
      knownProviderMatchIds,
      PROVIDER_NAME,
      now,
    );

    const { error: upsertError } = await supabase
      .from("matches")
      .upsert(rows, { onConflict: "provider_name,provider_match_id" });
    if (upsertError) throw upsertError;

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

    return NextResponse.json({
      updated: rows.length,
      skipped: unmatchedProviderMatchIds,
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
