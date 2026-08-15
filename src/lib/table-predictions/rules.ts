// Predict the Table capture rules -- see CLAUDE.md -> "Season-long feature:
// Predict the Table" and docs/adr/0003-predict-the-table-shape.md for the
// decided shape (band-sort, not a raw 1-20 rank entry) and the late-joiner
// lock-timing rules this module encodes.

export type BandKey =
  | "champion"
  // PROTOTYPE (proto/predict-table-rethink): the 8th Band. Splitting
  // position 2 out of Champions League makes the top of the table two sharp
  // single-club calls instead of one call plus a 4-blob, and makes every
  // multi-club Band exactly 3 -- which also retires the "Champions League
  // holds 4, give it 2x2 on a phone" layout special case in the capture spec.
  | "runners_up"
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

// PROTOTYPE order and target sizes: Champion (1), Runners Up (2), Champions
// League (3-5), Europe (6-8), Mid Table (9-11), Lower Table (12-14),
// Relegation Battle (15-17), Relegated (18-20). Still sums to 20, and the
// Band names stay honest -- positions 1-5 all qualify for the Champions
// League under the current format. Supersedes CLAUDE.md's 7-Band list while
// this branch is live.
export const TABLE_BANDS: readonly TableBand[] = [
  { key: "champion", label: "Champion", target: 1 },
  { key: "runners_up", label: "Runners Up", target: 1 },
  { key: "champions_league", label: "Champions League", target: 3 },
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
 * Submission never blocks on the result -- a mismatch only means the Band
 * Bonus for that Band is forfeited (docs/adr/0008-predict-the-table-group-fill-capture.md).
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

// End of 31 August 2026 in Australia/Sydney, represented in UTC. The cutoff
// is exclusive: requests at or after this instant are locked.
export const TABLE_PREDICTION_DEADLINE = new Date("2026-08-31T14:00:00.000Z");

/**
 * On-time players can edit/re-submit freely until the fixed deadline, then
 * are locked. Late Joiners are never locked -- they may submit at any time
 * after joining, or skip entirely (CLAUDE.md).
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

  const locked = params.now.getTime() >= TABLE_PREDICTION_DEADLINE.getTime();

  return { editable: !locked, locked, isLateJoiner: false };
}
