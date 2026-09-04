import "server-only";
import type { Route } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decomposeCountdown,
  formatKickoffInTimeZone,
} from "@/lib/dates/kickoff-format";
import {
  MATCH_SYNC_THRESHOLDS,
  SEASON_GAMEWEEK_COUNT,
  STANDINGS_SYNC_THRESHOLDS,
  type HealthState,
  lockedOutState,
  nextGameweekSelectionState,
  syncFreshnessState,
} from "@/lib/admin/health-signals";

// DB glue for the /admin health strip (docs/admin-ui-spec.md §5).
// Deliberately outside src/lib/** for the same reason as the sibling
// *-access.ts files: the colour maths that carries a real golden value is
// in src/lib/admin/health-signals.ts and is unit-tested there; everything
// here is thin Supabase round-tripping plus row-label prose.
//
// Every query is scoped to the caller's own competition_id where the table
// carries one (AGENTS.md, docs/adr/0004). `sync_log` and `matches` are
// global provider facts and carry no competition_id -- `sync_log` freshness
// is a property of the one external dependency, shared by every
// competition; `matches` is filtered by season + matchday.
//
// Phase 1 (this issue): only /admin/players exists as a jump target, so
// only the locked-out row gets an href. The sync and selection rows carry
// their actionable detail inline instead; /admin/sync arrives in Phase 2.

export type HealthSignalKey =
  "match-sync" | "standings-sync" | "next-gameweek" | "locked-out";

export interface HealthSignal {
  key: HealthSignalKey;
  label: string;
  state: HealthState;
  /** One plain-language line under the label. */
  detail: string;
  /** Where a red row jumps to, or null when no such section exists yet. */
  href: Route | null;
}

export interface AdminHealth {
  signals: HealthSignal[];
}

interface SyncLogRow {
  run_at: string;
  status: string;
  error_message: string | null;
}

const ERROR_DETAIL_MAX = 140;

function truncate(text: string): string {
  return text.length <= ERROR_DETAIL_MAX
    ? text
    : `${text.slice(0, ERROR_DETAIL_MAX - 1)}…`;
}

/** "3d 4h", "5h 12m", "45m", or "just now" for a past instant. */
function formatAge(fromMs: number, toMs: number): string {
  const { days, hours, minutes } = decomposeCountdown(toMs - fromMs);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "just now";
}

async function loadRecentSyncRows(
  supabase: SupabaseClient,
  syncType: "matches" | "standings",
): Promise<SyncLogRow[]> {
  const { data, error } = await supabase
    .from("sync_log")
    .select("run_at, status, error_message")
    .eq("sync_type", syncType)
    .order("run_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as SyncLogRow[];
}

function buildSyncSignal(
  key: "match-sync" | "standings-sync",
  label: string,
  rows: SyncLogRow[],
  thresholds: typeof MATCH_SYNC_THRESHOLDS,
  now: Date,
  timeZone: string,
): HealthSignal {
  const lastSuccess = rows.find((r) => r.status === "success") ?? null;
  const lastSuccessAt = lastSuccess ? new Date(lastSuccess.run_at) : null;
  const state = syncFreshnessState(lastSuccessAt, now, thresholds);

  let detail: string;
  if (lastSuccessAt === null) {
    detail = "No successful sync on record.";
  } else {
    const age = formatAge(lastSuccessAt.getTime(), now.getTime());
    const absolute = formatKickoffInTimeZone(lastSuccess!.run_at, timeZone);
    detail =
      state === "green"
        ? `Last success ${age} ago (${absolute}).`
        : `Last success was ${age} ago (${absolute}) — overdue.`;
  }

  const mostRecent = rows[0];
  if (mostRecent && mostRecent.status === "failure") {
    const reason = mostRecent.error_message
      ? truncate(mostRecent.error_message)
      : "no error message recorded";
    detail += ` Latest run failed: ${reason}`;
  }

  return { key, label, state, detail, href: null };
}

async function loadNextGameweekSignal(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string | null,
  currentGameweek: number | null,
  now: Date,
  timeZone: string,
): Promise<HealthSignal> {
  // Decision 4: "the next unstarted gameweek" is the lowest `gameweeks.number`
  // above the current one -- which, because `select-next.ts` only ever
  // creates the very next row, is `currentGameweek + 1` whenever a row
  // exists, and that same number as a fallback when it doesn't.
  const nextNumber = (currentGameweek ?? 0) + 1;

  if (seasonId === null) {
    return {
      key: "next-gameweek",
      label: "Next gameweek selected",
      state: "green",
      detail: "No season is running, so nothing is waiting to be selected.",
      href: null,
    };
  }

  const [gameweekResult, firstFixtureResult] = await Promise.all([
    supabase
      .from("gameweeks")
      .select("number, match_1_id")
      .eq("season_id", seasonId)
      .eq("competition_id", competitionId)
      .gt("number", currentGameweek ?? 0)
      .order("number", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("matches")
      .select("kickoff_time")
      .eq("season_id", seasonId)
      .eq("matchday", nextNumber)
      .order("kickoff_time", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (gameweekResult.error) throw gameweekResult.error;
  if (firstFixtureResult.error) throw firstFixtureResult.error;

  const match1Id = (gameweekResult.data?.match_1_id as string | null) ?? null;
  const firstFixtureIso =
    (firstFixtureResult.data?.kickoff_time as string | undefined) ?? null;
  const firstFixtureKickoff = firstFixtureIso
    ? new Date(firstFixtureIso)
    : null;

  // There IS a next gameweek to select unless the season is over. A missing
  // `gameweeks` row or missing `matches.matchday` values mid-season just
  // mean "not synced yet" (which must read as amber), NOT "nothing due".
  const hasNextGameweek = nextNumber <= SEASON_GAMEWEEK_COUNT;

  const state = nextGameweekSelectionState({
    hasNextGameweek,
    match1Id,
    firstFixtureKickoff,
    now,
  });

  let detail: string;
  if (!hasNextGameweek) {
    detail = "The season's final gameweek has been reached.";
  } else if (match1Id !== null) {
    detail = `Gameweek ${nextNumber} is selected.`;
  } else if (firstFixtureIso === null) {
    detail = `Gameweek ${nextNumber} isn't selected yet — its fixtures haven't synced.`;
  } else {
    const when = `first kick-off ${formatKickoffInTimeZone(firstFixtureIso, timeZone)}`;
    detail =
      state === "red"
        ? `Gameweek ${nextNumber} still isn't selected — ${when}.`
        : `Gameweek ${nextNumber} isn't selected yet — ${when}.`;
  }

  return {
    key: "next-gameweek",
    label: "Next gameweek selected",
    state,
    detail,
    href: null,
  };
}

async function loadLockedOutSignal(
  supabase: SupabaseClient,
  competitionId: string,
  now: Date,
): Promise<HealthSignal> {
  // Selecting the rows and counting them in JS rather than a `count: exact`
  // head request -- consistent with every other player count in this app
  // (admin-index-access.ts) and with the mock-Supabase shape the sibling
  // tests use. The locked-out subset is at most a handful of rows.
  const { data, error } = await supabase
    .from("players")
    .select("id")
    .eq("competition_id", competitionId)
    .gt("locked_until", now.toISOString())
    .order("id", { ascending: true });
  if (error) throw error;

  const lockedCount = (data ?? []).length;
  const state = lockedOutState(lockedCount);

  return {
    key: "locked-out",
    label: "Locked-out players",
    state,
    detail:
      lockedCount === 0
        ? "No players are locked out."
        : `${lockedCount} ${lockedCount === 1 ? "player is" : "players are"} locked out right now.`,
    href:
      state === "red"
        ? ("/admin/players?filter=needs-attention" as Route)
        : null,
  };
}

/**
 * The four health signals for the /admin strip, in display order.
 *
 * `seasonId` and `currentGameweek` are passed in (the page resolves them
 * once for the counts row) so this loader adds no `seasons` round trip and
 * no second current-gameweek resolve. Its own reads -- two `sync_log`
 * lookups, the next-gameweek pair, and the locked-out count -- are mutually
 * independent and run in one wave.
 */
export async function loadAdminHealth(
  supabase: SupabaseClient,
  competitionId: string,
  seasonId: string | null,
  currentGameweek: number | null,
  now: Date,
  timeZone: string,
): Promise<AdminHealth> {
  const [matchRows, standingsRows, nextGameweek, lockedOut] = await Promise.all(
    [
      loadRecentSyncRows(supabase, "matches"),
      loadRecentSyncRows(supabase, "standings"),
      loadNextGameweekSignal(
        supabase,
        competitionId,
        seasonId,
        currentGameweek,
        now,
        timeZone,
      ),
      loadLockedOutSignal(supabase, competitionId, now),
    ],
  );

  const signals: HealthSignal[] = [
    buildSyncSignal(
      "match-sync",
      "Match sync",
      matchRows,
      MATCH_SYNC_THRESHOLDS,
      now,
      timeZone,
    ),
    buildSyncSignal(
      "standings-sync",
      "Standings sync",
      standingsRows,
      STANDINGS_SYNC_THRESHOLDS,
      now,
      timeZone,
    ),
    nextGameweek,
    lockedOut,
  ];

  return { signals };
}
