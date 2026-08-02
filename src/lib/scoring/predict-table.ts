/**
 * Predict the Table scoring — see CLAUDE.md's "Predict the Table" section
 * and docs/adr/0003-predict-the-table-shape.md for the full decision.
 *
 * Both `predictedOrder` and `actualOrder` are full 20-team orderings
 * (index 0 = 1st place), matching the "always store the full ordering"
 * rule. Only which Table Band a team's position falls into is ever read —
 * order within a Band carries no scoring weight.
 */

export type TeamId = string;

export interface TableBand {
  readonly name: string;
  readonly size: number;
}

export const TABLE_BANDS: readonly TableBand[] = [
  { name: "Champion", size: 1 },
  { name: "Champions League", size: 4 },
  { name: "Europe", size: 3 },
  { name: "Mid Table", size: 3 },
  { name: "Lower Table", size: 3 },
  { name: "Relegation Battle", size: 3 },
  { name: "Relegated", size: 3 },
];

export const TOTAL_TEAMS = TABLE_BANDS.reduce(
  (sum, band) => sum + band.size,
  0,
);

export const CHAMPION_BAND_INDEX = 0;
export const PER_BAND_BONUS = 10;
export const CHAMPION_BAND_BONUS = 20;

const PERFECT_TEAM_SCORE = TABLE_BANDS.length - 1; // 6
const TOTAL_BAND_BONUS =
  CHAMPION_BAND_BONUS + (TABLE_BANDS.length - 1) * PER_BAND_BONUS; // 80

export const MAX_PREDICT_TABLE_SCORE =
  TOTAL_TEAMS * PERFECT_TEAM_SCORE + TOTAL_BAND_BONUS; // 200

/** Zero-indexed Table Band for a 1-indexed final-table rank (1 = Champion). */
export function bandIndexForRank(rank: number): number {
  if (rank < 1) {
    throw new Error(`rank ${rank} is outside 1-${TOTAL_TEAMS}`);
  }
  let rankCursor = 0;
  for (let bandIndex = 0; bandIndex < TABLE_BANDS.length; bandIndex++) {
    rankCursor += TABLE_BANDS[bandIndex].size;
    if (rank <= rankCursor) return bandIndex;
  }
  throw new Error(`rank ${rank} is outside 1-${TOTAL_TEAMS}`);
}

/** Points for one team: 6 minus the number of Bands between prediction and actual. */
export function teamScore(
  predictedBandIndex: number,
  actualBandIndex: number,
): number {
  const bandDistance = Math.abs(predictedBandIndex - actualBandIndex);
  return PERFECT_TEAM_SCORE - bandDistance;
}

export interface PredictTableScoreResult {
  readonly totalScore: number;
  readonly teamScores: Readonly<Record<TeamId, number>>;
  readonly bandBonuses: Readonly<Record<string, number>>;
}

function bandByTeam(order: readonly TeamId[]): Map<TeamId, number> {
  const map = new Map<TeamId, number>();
  order.forEach((team, index) => map.set(team, bandIndexForRank(index + 1)));
  return map;
}

export function scorePredictTable(
  predictedOrder: readonly TeamId[],
  actualOrder: readonly TeamId[],
): PredictTableScoreResult {
  if (
    predictedOrder.length !== TOTAL_TEAMS ||
    actualOrder.length !== TOTAL_TEAMS
  ) {
    throw new Error(
      `expected ${TOTAL_TEAMS} teams in both orderings, got ${predictedOrder.length} predicted / ${actualOrder.length} actual`,
    );
  }

  const predictedBand = bandByTeam(predictedOrder);
  const actualBand = bandByTeam(actualOrder);

  const teamScores: Record<TeamId, number> = {};
  for (const team of actualOrder) {
    const predicted = predictedBand.get(team);
    const actual = actualBand.get(team);
    if (predicted === undefined || actual === undefined) {
      throw new Error(`team "${team}" is missing from the prediction`);
    }
    teamScores[team] = teamScore(predicted, actual);
  }

  const bandBonuses: Record<string, number> = {};
  TABLE_BANDS.forEach((band, bandIndex) => {
    const actualMembers = new Set(
      actualOrder.filter((team) => actualBand.get(team) === bandIndex),
    );
    const predictedMembers = new Set(
      predictedOrder.filter((team) => predictedBand.get(team) === bandIndex),
    );
    const exactMatch =
      actualMembers.size === predictedMembers.size &&
      [...actualMembers].every((team) => predictedMembers.has(team));

    bandBonuses[band.name] = exactMatch
      ? bandIndex === CHAMPION_BAND_INDEX
        ? CHAMPION_BAND_BONUS
        : PER_BAND_BONUS
      : 0;
  });

  const totalScore =
    Object.values(teamScores).reduce((sum, score) => sum + score, 0) +
    Object.values(bandBonuses).reduce((sum, bonus) => sum + bonus, 0);

  return { totalScore, teamScores, bandBonuses };
}
