// Predict the Table capture rules -- see CLAUDE.md -> "Season-long feature:
// Predict the Table" and docs/adr/0003-predict-the-table-shape.md for the
// decided shape (band-sort, not a raw 1-20 rank entry) and the late-joiner
// lock-timing rules this module encodes.

export type BandKey =
  | "champion"
  | "champions_league"
  | "europe"
  | "mid_table"
  | "lower_table"
  | "relegation_battle"
  | "relegated";

export interface TableBand {
  key: BandKey;
  label: string;
  target: number;
}

// Order and target sizes per CLAUDE.md: Champion (1), Champions League
// (2-5), Europe (6-8), Mid Table (9-11), Lower Table (12-14), Relegation
// Battle (15-17), Relegated (18-20).
export const TABLE_BANDS: readonly TableBand[] = [
  { key: "champion", label: "Champion", target: 1 },
  { key: "champions_league", label: "Champions League", target: 4 },
  { key: "europe", label: "Europe", target: 3 },
  { key: "mid_table", label: "Mid Table", target: 3 },
  { key: "lower_table", label: "Lower Table", target: 3 },
  { key: "relegation_battle", label: "Relegation Battle", target: 3 },
  { key: "relegated", label: "Relegated", target: 3 },
];

export const TOTAL_TEAMS = 20;

export const BAND_KEYS: readonly BandKey[] = TABLE_BANDS.map((b) => b.key);

export function isBandKey(value: string): value is BandKey {
  return (BAND_KEYS as readonly string[]).includes(value);
}

export interface BandMismatch {
  band: BandKey;
  expected: number;
  actual: number;
}

export interface BandValidationResult {
  ok: boolean;
  mismatches: BandMismatch[];
  unsortedCount: number;
}

/**
 * Checks a player's current band assignment against the fixed target sizes.
 * Submission is only allowed once every band matches its target and no team
 * is left in the unsorted pool (see CLAUDE.md's "flagged and fixed" rule).
 */
export function validateBandCounts(
  counts: Partial<Record<BandKey, number>>,
): BandValidationResult {
  const mismatches: BandMismatch[] = [];
  let totalSorted = 0;

  for (const band of TABLE_BANDS) {
    const actual = counts[band.key] ?? 0;
    totalSorted += actual;
    if (actual !== band.target) {
      mismatches.push({ band: band.key, expected: band.target, actual });
    }
  }

  const unsortedCount = TOTAL_TEAMS - totalSorted;

  return {
    ok: mismatches.length === 0 && unsortedCount === 0,
    mismatches,
    unsortedCount,
  };
}

/**
 * A Late Joiner is a player who signed up after Gameweek 1 had already
 * begun (see CLAUDE.md -> "Late joiners"). `gameweekOneKickoff` is the
 * earliest kickoff of the current season -- null if the season's fixtures
 * haven't been seeded yet, in which case nobody can be a late joiner.
 */
export function isLateJoiner(
  joinedAt: Date,
  gameweekOneKickoff: Date | null,
): boolean {
  if (!gameweekOneKickoff) return false;
  return joinedAt.getTime() > gameweekOneKickoff.getTime();
}

export interface TablePredictionEditability {
  editable: boolean;
  locked: boolean;
  isLateJoiner: boolean;
}

/**
 * On-time players can edit/re-submit freely until Gameweek 1's first
 * kickoff, then are locked. Late Joiners are never locked -- they may
 * submit at any time after joining, or skip entirely (CLAUDE.md).
 */
export function getTablePredictionEditability(params: {
  joinedAt: Date;
  now: Date;
  gameweekOneKickoff: Date | null;
}): TablePredictionEditability {
  const lateJoiner = isLateJoiner(params.joinedAt, params.gameweekOneKickoff);
  if (lateJoiner) {
    return { editable: true, locked: false, isLateJoiner: true };
  }

  const locked =
    params.gameweekOneKickoff !== null &&
    params.now.getTime() >= params.gameweekOneKickoff.getTime();

  return { editable: !locked, locked, isLateJoiner: false };
}
