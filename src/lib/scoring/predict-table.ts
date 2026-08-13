/**
 * Predict the Table scoring — see CLAUDE.md's "Predict the Table" section
 * and docs/adr/0010-predict-the-table-scoring.md for the full decision.
 *
 * Three components, summing to a maximum of 200:
 *   Placement    5 / 2 / 1 / 0 by Band distance (0 / 1 / 2 / 3+)   max 100
 *   Band Bonus   exact full membership; 15 for Champion, Champions
 *                League and Relegated, 10 for the other four         max  85
 *   Bold Call    +3 for a correct placement that fewer than a third
 *                of the frozen Gameweek-1 cohort also made; best 5   max  15
 *
 * The predicted side is a team-to-Band assignment map: a prediction under
 * docs/adr/0008-predict-the-table-group-fill-capture.md may have Bands of
 * any size, a team left unplaced scores nothing, and a wrongly-sized Band
 * simply forfeits its bonus. The actual side is the genuine 1-20 standings
 * ordering (index 0 = 1st place) and must be exactly `TOTAL_TEAMS` long.
 * Only which Table Band a team lands in is ever read — order within a Band
 * carries no scoring weight.
 *
 * Placement and Band Bonus are a pure function of one prediction, so
 * `scorePredictTable` stands alone. Bold Calls are inherently a property of
 * the cohort, so they live in `scorePredictTableCohort` — the only entry
 * point that can produce a complete score.
 */

export type TeamId = string;

export interface TableBand {
  readonly name: string;
  readonly size: number;
  /** Awarded for predicting this Band's full membership exactly, any order. */
  readonly bonus: number;
}

/**
 * Champion, Champions League and Relegated carry the larger bonus: they are
 * the Bands the season is actually about. They are also the easier ones to
 * hit (Champion needs a single team right, Mid Table needs three exact), so
 * the premium is larger per unit of effort than the 15-vs-10 gap suggests.
 */
export const TABLE_BANDS: readonly TableBand[] = [
  { name: "Champion", size: 1, bonus: 15 },
  { name: "Champions League", size: 4, bonus: 15 },
  { name: "Europe", size: 3, bonus: 10 },
  { name: "Mid Table", size: 3, bonus: 10 },
  { name: "Lower Table", size: 3, bonus: 10 },
  { name: "Relegation Battle", size: 3, bonus: 10 },
  { name: "Relegated", size: 3, bonus: 15 },
];

export const TOTAL_TEAMS = TABLE_BANDS.reduce(
  (sum, band) => sum + band.size,
  0,
);

export const CHAMPION_BAND_INDEX = 0;

/** Points by Band distance; anything further out than this scores 0. */
export const PLACEMENT_POINTS_BY_DISTANCE: readonly number[] = [5, 2, 1];

export const BOLD_CALL_BONUS = 3;
export const MAX_BOLD_CALLS = 5;

const MAX_PLACEMENT_SCORE = TOTAL_TEAMS * PLACEMENT_POINTS_BY_DISTANCE[0]; // 100
const MAX_BAND_BONUS_SCORE = TABLE_BANDS.reduce(
  (sum, band) => sum + band.bonus,
  0,
); // 85
const MAX_BOLD_CALL_SCORE = MAX_BOLD_CALLS * BOLD_CALL_BONUS; // 15

export const MAX_PREDICT_TABLE_SCORE =
  MAX_PLACEMENT_SCORE + MAX_BAND_BONUS_SCORE + MAX_BOLD_CALL_SCORE; // 200

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

/** Points for one team: 5 for the right Band, 2 one out, 1 two out, else 0. */
export function teamScore(
  predictedBandIndex: number,
  actualBandIndex: number,
): number {
  const bandDistance = Math.abs(predictedBandIndex - actualBandIndex);
  return PLACEMENT_POINTS_BY_DISTANCE[bandDistance] ?? 0;
}

export interface PredictTableScoreResult {
  /** Placement + Band Bonus + Bold Call. */
  readonly totalScore: number;
  readonly placementScore: number;
  readonly bandBonusScore: number;
  readonly boldCallScore: number;
  readonly teamScores: Readonly<Record<TeamId, number>>;
  readonly bandBonuses: Readonly<Record<string, number>>;
  /** Teams whose correct placement earned a Bold Call, rarest first. */
  readonly boldCalls: readonly TeamId[];
}

function bandByTeam(order: readonly TeamId[]): Map<TeamId, number> {
  const map = new Map<TeamId, number>();
  order.forEach((team, index) => map.set(team, bandIndexForRank(index + 1)));
  return map;
}

function assertValidPrediction(
  predictedBands: ReadonlyMap<TeamId, number>,
  actualBand: ReadonlyMap<TeamId, number>,
): void {
  for (const [team, bandIndex] of predictedBands) {
    if (
      !Number.isInteger(bandIndex) ||
      bandIndex < 0 ||
      bandIndex >= TABLE_BANDS.length
    ) {
      throw new Error(
        `team "${team}" has invalid predicted Band index ${bandIndex} (expected 0-${TABLE_BANDS.length - 1})`,
      );
    }
    if (!actualBand.has(team)) {
      throw new Error(`team "${team}" is not in the actual table`);
    }
  }
}

function assertCompleteTable(actualOrder: readonly TeamId[]): void {
  if (actualOrder.length !== TOTAL_TEAMS) {
    throw new Error(
      `expected ${TOTAL_TEAMS} teams in the actual ordering, got ${actualOrder.length}`,
    );
  }
}

/**
 * Placement and Band Bonus for one prediction. Bold Calls are always empty
 * here — they need the cohort, so a complete score comes from
 * `scorePredictTableCohort`.
 */
export function scorePredictTable(
  predictedBands: ReadonlyMap<TeamId, number>,
  actualOrder: readonly TeamId[],
): PredictTableScoreResult {
  assertCompleteTable(actualOrder);
  const actualBand = bandByTeam(actualOrder);
  assertValidPrediction(predictedBands, actualBand);

  const teamScores: Record<TeamId, number> = {};
  for (const [team, actual] of actualBand) {
    const predicted = predictedBands.get(team);
    teamScores[team] =
      predicted === undefined ? 0 : teamScore(predicted, actual);
  }

  const bandBonuses: Record<string, number> = {};
  TABLE_BANDS.forEach((band, bandIndex) => {
    const actualMembers = actualOrder.filter(
      (team) => actualBand.get(team) === bandIndex,
    );
    const predictedMembers = [...predictedBands.entries()]
      .filter(([, index]) => index === bandIndex)
      .map(([team]) => team);
    const predictedSet = new Set(predictedMembers);
    const exactMatch =
      actualMembers.length === predictedSet.size &&
      actualMembers.every((team) => predictedSet.has(team));

    bandBonuses[band.name] = exactMatch ? band.bonus : 0;
  });

  const placementScore = Object.values(teamScores).reduce(
    (sum, score) => sum + score,
    0,
  );
  const bandBonusScore = Object.values(bandBonuses).reduce(
    (sum, bonus) => sum + bonus,
    0,
  );

  return {
    totalScore: placementScore + bandBonusScore,
    placementScore,
    bandBonusScore,
    boldCallScore: 0,
    teamScores,
    bandBonuses,
    boldCalls: [],
  };
}

export interface CohortEntry<K> {
  readonly key: K;
  readonly bands: ReadonlyMap<TeamId, number>;
  /**
   * False for a Late Joiner: they are scored and ranked but sit outside the
   * Bold Call process entirely — they neither earn Bold Calls nor count
   * toward anyone else's rarity, so a mid-season signup can never move a
   * score that was already earned.
   */
  readonly boldCallEligible: boolean;
}

/** A placement is a Bold Call when strictly fewer than a third agreed. */
function isRare(agreeCount: number, cohortSize: number): boolean {
  return agreeCount * 3 < cohortSize;
}

/**
 * Scores every prediction in a competition, including Bold Calls.
 *
 * Rarity is measured only against Bold-Call-eligible entries — the cohort
 * frozen at Gameweek 1's lock — and the player's own prediction counts
 * toward its own rarity, so "fewer than a third" means the player plus at
 * most a handful of others.
 */
export function scorePredictTableCohort<K>(
  entries: readonly CohortEntry<K>[],
  actualOrder: readonly TeamId[],
): Map<K, PredictTableScoreResult> {
  assertCompleteTable(actualOrder);
  const actualBand = bandByTeam(actualOrder);

  const eligible = entries.filter((entry) => entry.boldCallEligible);

  // How many eligible predictions put each team in each Band.
  const agreement = new Map<string, number>();
  const agreementKey = (team: TeamId, bandIndex: number) =>
    `${team} ${bandIndex}`;
  for (const entry of eligible) {
    assertValidPrediction(entry.bands, actualBand);
    for (const [team, bandIndex] of entry.bands) {
      const key = agreementKey(team, bandIndex);
      agreement.set(key, (agreement.get(key) ?? 0) + 1);
    }
  }

  const results = new Map<K, PredictTableScoreResult>();
  for (const entry of entries) {
    const base = scorePredictTable(entry.bands, actualOrder);
    if (!entry.boldCallEligible || eligible.length === 0) {
      results.set(entry.key, base);
      continue;
    }

    const qualifying: { team: TeamId; agreeCount: number }[] = [];
    for (const [team, bandIndex] of entry.bands) {
      if (actualBand.get(team) !== bandIndex) continue;
      const agreeCount = agreement.get(agreementKey(team, bandIndex)) ?? 0;
      if (isRare(agreeCount, eligible.length)) {
        qualifying.push({ team, agreeCount });
      }
    }

    // Rarest first; team id breaks ties so the chosen five are deterministic.
    qualifying.sort(
      (a, b) => a.agreeCount - b.agreeCount || a.team.localeCompare(b.team),
    );
    const boldCalls = qualifying
      .slice(0, MAX_BOLD_CALLS)
      .map(({ team }) => team);
    const boldCallScore = boldCalls.length * BOLD_CALL_BONUS;

    results.set(entry.key, {
      ...base,
      boldCalls,
      boldCallScore,
      totalScore: base.totalScore + boldCallScore,
    });
  }

  return results;
}
