// Green / amber / red state maths for the /admin health strip
// (docs/admin-ui-spec.md §5). Pure: every input is a value or a `now` the
// caller supplies, so the thresholds can be pinned to spec §5's numbers
// directly (see health-signals.test.ts). The DB glue that feeds these lives
// in src/app/_lib/admin-health-access.ts; the row labels/links live in the
// component. This module only decides the colour.
//
// Spec §5 states green and red per signal and calls amber "the band
// between" -- so amber is defined here purely as "not green and not red",
// never its own threshold.

export type HealthState = "green" | "amber" | "red";

// Freshness thresholds, in milliseconds. The `matches` sync runs on a
// ~10-15 min cadence on match days; `standings` far less often. Both mirror
// docs/admin-ui-spec.md §5's table exactly.
export const MATCH_SYNC_GREEN_WITHIN_MS = 60 * 60 * 1000; // 60 min
export const MATCH_SYNC_RED_AFTER_MS = 6 * 60 * 60 * 1000; // 6 h
export const STANDINGS_SYNC_GREEN_WITHIN_MS = 24 * 60 * 60 * 1000; // 24 h
export const STANDINGS_SYNC_RED_AFTER_MS = 72 * 60 * 60 * 1000; // 72 h

// Spec §5: the "next gameweek selected" signal goes red once the next
// gameweek's first fixture is inside this window and Match 1 is still
// unchosen.
export const NEXT_GAMEWEEK_SELECTION_RED_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 h

// A Premier League season is 38 gameweeks (CLAUDE.md -> "an ongoing
// ~38-gameweek season"). Used only to tell "the next gameweek isn't
// selected yet" (amber/red) apart from "there is no next gameweek"
// (green) at the end of the season -- the `gameweeks` row and the
// `matches.matchday` values for a future gameweek may both be absent
// mid-season before a sync has populated them, and that state must still
// read as amber, not green.
export const SEASON_GAMEWEEK_COUNT = 38;

export interface FreshnessThresholds {
  greenWithinMs: number;
  redAfterMs: number;
}

export const MATCH_SYNC_THRESHOLDS: FreshnessThresholds = {
  greenWithinMs: MATCH_SYNC_GREEN_WITHIN_MS,
  redAfterMs: MATCH_SYNC_RED_AFTER_MS,
};

export const STANDINGS_SYNC_THRESHOLDS: FreshnessThresholds = {
  greenWithinMs: STANDINGS_SYNC_GREEN_WITHIN_MS,
  redAfterMs: STANDINGS_SYNC_RED_AFTER_MS,
};

/**
 * Freshness of a sync signal, measured from its last *success* timestamp
 * (not its last run -- a run of failures should read as increasingly
 * stale). green when the last success is within `greenWithinMs`, red once
 * it is older than `redAfterMs` or there has never been one, amber in
 * between. A last-success instant in the future (clock skew between the DB
 * and this process) is treated as green rather than as an error.
 */
export function syncFreshnessState(
  lastSuccessAt: Date | null,
  now: Date,
  thresholds: FreshnessThresholds,
): HealthState {
  if (lastSuccessAt === null) return "red";
  const ageMs = now.getTime() - lastSuccessAt.getTime();
  if (ageMs <= thresholds.greenWithinMs) return "green";
  if (ageMs > thresholds.redAfterMs) return "red";
  return "amber";
}

export interface NextGameweekSelectionInput {
  /**
   * Whether a next gameweek exists to select at all. False at end of season
   * (or before its fixtures are synced) -- nothing is due, so the signal is
   * green.
   */
  hasNextGameweek: boolean;
  /**
   * The next gameweek's Match 1 fixture id. Null when the slot is unchosen
   * or the `gameweeks` row does not exist yet. `select-next.ts` treats
   * `match_1_id` being set as "already selected" (a null `match_2_id` beside
   * it is a legitimate final Skipped Slot), so this signal keys off Match 1
   * alone for the same reason.
   */
  match1Id: string | null;
  /**
   * Earliest kickoff among that matchday's fixtures. Null when no fixtures
   * for the matchday have been synced yet.
   */
  firstFixtureKickoff: Date | null;
  now: Date;
}

/**
 * "Next gameweek selected" (docs/admin-ui-spec.md §5):
 * - green: nothing is due, or Match 1 is already chosen;
 * - red: unchosen and the first fixture is within 48 h (or already past);
 * - amber: unchosen, but the first fixture is more than 48 h away or not
 *   yet scheduled.
 */
export function nextGameweekSelectionState(
  input: NextGameweekSelectionInput,
): HealthState {
  if (!input.hasNextGameweek) return "green";
  if (input.match1Id !== null) return "green";
  if (input.firstFixtureKickoff === null) return "amber";
  const msUntilKickoff =
    input.firstFixtureKickoff.getTime() - input.now.getTime();
  if (msUntilKickoff <= NEXT_GAMEWEEK_SELECTION_RED_WINDOW_MS) return "red";
  return "amber";
}

/**
 * Locked-out players (spec §5): red if any player in the competition is
 * locked right now, green otherwise. Binary -- spec gives this signal no
 * amber band.
 */
export function lockedOutState(lockedPlayerCount: number): HealthState {
  return lockedPlayerCount > 0 ? "red" : "green";
}
