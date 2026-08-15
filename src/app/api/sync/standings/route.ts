import { NextResponse } from "next/server";
import { mapStandingsToRows } from "@/lib/standings/map-standings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Issue #88: standalone standings-fetch route, callable manually now and by
// #11's GitHub Actions sync workflow once it exists (see #88's decision log,
// 2026-08-09, for why this isn't blocked on #11 landing first).
//
// Auth: no existing route shape fits a server-to-server caller (every other
// route expects a player session cookie -- see
// src/app/api/table-predictions/submit/route.ts). A shared-secret header
// stands in for that, mirroring the app's existing custom-header CSRF shape
// (src/app/_lib/csrf.ts) but keyed on a secret instead of mere presence.
const SYNC_TRIGGER_HEADER = "x-sync-secret";
const PROVIDER_NAME = "football-data.org";

function hasValidSyncSecret(request: Request): boolean {
  const expected = process.env.SYNC_TRIGGER_SECRET;
  if (!expected) return false;
  return request.headers.get(SYNC_TRIGGER_HEADER) === expected;
}

async function fetchStandings(apiKey: string) {
  const res = await fetch(
    "https://api.football-data.org/v4/competitions/PL/standings",
    { headers: { "X-Auth-Token": apiKey } },
  );
  if (!res.ok) {
    throw new Error(
      `football-data.org standings fetch failed: ${res.status} ${await res.text()}`,
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

  try {
    const [standingsResponse, teamsResult, seasonResult] = await Promise.all([
      fetchStandings(apiKey),
      supabase
        .from("teams")
        .select("id, provider_team_id")
        .eq("provider_name", PROVIDER_NAME),
      supabase.from("seasons").select("id").eq("is_current", true).single(),
    ]);

    if (teamsResult.error) throw teamsResult.error;
    if (seasonResult.error) throw seasonResult.error;

    const teamIdByProviderId = new Map(
      teamsResult.data.map((team) => [team.provider_team_id, team.id]),
    );

    const { rows, unmatchedProviderTeamIds, degenerate } = mapStandingsToRows(
      standingsResponse,
      teamIdByProviderId,
      seasonResult.data.id,
      new Date(),
    );

    if (degenerate) {
      // Pre-season placeholder (football-data.org emits every team at
      // position 1 / 0 played before real results exist). Overwriting the
      // stored rows would replace real positions with garbage, so skip the
      // upsert and note it in sync_log instead.
      await supabase.from("sync_log").insert({
        provider_name: PROVIDER_NAME,
        sync_type: "standings",
        status: "success",
        error_message:
          "skipped degenerate standings snapshot (every team at the same position) -- kept existing rows",
      });
      return NextResponse.json({
        updated: 0,
        skipped: unmatchedProviderTeamIds,
        degenerate: true,
      });
    }

    const { error: upsertError } = await supabase
      .from("team_standings")
      .upsert(rows, { onConflict: "team_id,season_id" });
    if (upsertError) throw upsertError;

    const errorMessage =
      unmatchedProviderTeamIds.length > 0
        ? `skipped ${unmatchedProviderTeamIds.length} unmatched teams: ${unmatchedProviderTeamIds.join(", ")}`
        : null;

    await supabase.from("sync_log").insert({
      provider_name: PROVIDER_NAME,
      sync_type: "standings",
      status: "success",
      error_message: errorMessage,
    });

    return NextResponse.json({
      updated: rows.length,
      skipped: unmatchedProviderTeamIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("sync_log").insert({
      provider_name: PROVIDER_NAME,
      sync_type: "standings",
      status: "failure",
      error_message: message,
    });
    return NextResponse.json(
      { error: "Standings sync failed -- see sync_log." },
      { status: 500 },
    );
  }
}
