// The comparison view-model behind /predict-table/[playerId] (issue #214):
// turns two scored predictions and the real standings into G's rows,
// sections and header figures. Pure -- every number comes from the
// `PredictTableScoreResult`s `scorePredictTableCohort` produced, and every
// rule constant from src/lib/scoring or ./rules, never typed here.
//
// Decisions it encodes (issue #214's log): a row shows Placement plus any
// Bold Call (D10); an exact Band's bonus belongs to its section, not a row
// (D12); the copy says "now" until the season is over (D13); the higher
// figure is marked by `leads`, which the UI renders bold, never green (D11).

import {
  BOLD_CALL_BONUS,
  MAX_BOLD_CALLS,
  PLACEMENT_POINTS_BY_DISTANCE,
  TABLE_BANDS as SCORING_BANDS,
  TOTAL_TEAMS,
  bandIndexForRank,
  type PredictTableScoreResult,
  type TeamId,
} from "@/lib/scoring/predict-table";
import { TABLE_BANDS, TABLE_PREDICTION_DEADLINE } from "./rules";

/** Each score part's maximum, derived the way the leaderboard derives it. */
export const MAX_PLACEMENT = TOTAL_TEAMS * PLACEMENT_POINTS_BY_DISTANCE[0];
export const MAX_BAND_BONUS = SCORING_BANDS.reduce(
  (sum, band) => sum + band.bonus,
  0,
);
export const MAX_BOLD_CALLS_SCORE = MAX_BOLD_CALLS * BOLD_CALL_BONUS;

export interface ComparisonTeam {
  id: TeamId;
  name: string;
  shortCode: string | null;
}

export interface ComparedSide {
  /** Team -> predicted Band index (0-7). A missing team was never placed. */
  bands: ReadonlyMap<TeamId, number>;
  result: PredictTableScoreResult;
}

export interface SideCall {
  /** Predicted Band index, or null when the club was never placed. */
  band: number | null;
  /** This club's Placement points (its Band distance). */
  placement: number;
  /** What the row shows: Placement plus the Bold Call bonus, if earned. */
  points: number;
  boldCall: boolean;
}

export interface ComparisonRow {
  teamId: TeamId;
  name: string;
  shortCode: string | null;
  /** 1-based position in the current standings. */
  position: number;
  /** The Band index the club is in now. */
  actualBand: number;
  you: SideCall;
  them: SideCall;
}

export interface ComparisonSection {
  bandIndex: number;
  label: string;
  rows: ComparisonRow[];
  /** This Band's exact-membership bonus for each player; 0 if not exact. */
  youBandBonus: number;
  themBandBonus: number;
}

export interface SideTotals {
  placement: number;
  bandBonus: number;
  boldCalls: number;
  total: number;
  /** Labels of the Bands this player got exactly right, in table order. */
  exactBands: string[];
}

export interface TableComparison {
  sections: ComparisonSection[];
  you: SideTotals;
  them: SideTotals;
}

function sideCall(side: ComparedSide, teamId: TeamId): SideCall {
  const placement = side.result.teamScores[teamId] ?? 0;
  const boldCall = side.result.boldCalls.includes(teamId);
  return {
    band: side.bands.get(teamId) ?? null,
    placement,
    points: placement + (boldCall ? BOLD_CALL_BONUS : 0),
    boldCall,
  };
}

function bandBonus(result: PredictTableScoreResult, bandIndex: number): number {
  return result.bandBonuses[TABLE_BANDS[bandIndex].label] ?? 0;
}

function sideTotals(result: PredictTableScoreResult): SideTotals {
  return {
    placement: result.placementScore,
    bandBonus: result.bandBonusScore,
    boldCalls: result.boldCallScore,
    total: result.totalScore,
    exactBands: TABLE_BANDS.map((band) => band.label).filter(
      (label) => (result.bandBonuses[label] ?? 0) > 0,
    ),
  };
}

/**
 * Builds the comparison. `actualOrder` is the current standings, index 0 =
 * 1st, exactly `TOTAL_TEAMS` long -- the same ordering the results were
 * scored against.
 */
export function buildTableComparison(params: {
  actualOrder: readonly TeamId[];
  teams: ReadonlyMap<TeamId, ComparisonTeam>;
  you: ComparedSide;
  them: ComparedSide;
}): TableComparison {
  const { actualOrder, teams, you, them } = params;
  const sections: ComparisonSection[] = TABLE_BANDS.map((band, bandIndex) => ({
    bandIndex,
    label: band.label,
    rows: [],
    youBandBonus: bandBonus(you.result, bandIndex),
    themBandBonus: bandBonus(them.result, bandIndex),
  }));

  actualOrder.forEach((teamId, index) => {
    const position = index + 1;
    const actualBand = bandIndexForRank(position);
    const team = teams.get(teamId);
    sections[actualBand].rows.push({
      teamId,
      name: team?.name ?? teamId,
      shortCode: team?.shortCode ?? null,
      position,
      actualBand,
      you: sideCall(you, teamId),
      them: sideCall(them, teamId),
    });
  });

  return {
    sections,
    you: sideTotals(you.result),
    them: sideTotals(them.result),
  };
}

/** "Right Band", "1 Band out", "3+ Bands out", or "Not placed". */
export function distanceLabel(call: SideCall, actualBand: number): string {
  if (call.band === null) return "Not placed";
  const distance = Math.abs(call.band - actualBand);
  if (distance === 0) return "Right Band";
  // Past the last scoring distance, every distance scores the same 0.
  const floor = PLACEMENT_POINTS_BY_DISTANCE.length;
  if (distance >= floor) return `${String(floor)}+ Bands out`;
  return `${String(distance)} Band${distance === 1 ? "" : "s"} out`;
}

/**
 * Whether `mine` is the figure that wins the comparison. Level figures are
 * no one's lead, so neither is emphasised.
 */
export function leads(mine: number, theirs: number): boolean {
  return mine > theirs;
}

/**
 * The header's one sentence: the gap and nothing else (prototype Q10,
 * "numbers only") -- the labelled table explains it.
 */
export function gapSentence(
  themName: string,
  youTotal: number,
  themTotal: number,
): string {
  const gap = Math.abs(youTotal - themTotal);
  if (gap === 0) {
    return `You and ${themName} are level on ${String(youTotal)}.`;
  }
  return youTotal > themTotal
    ? `You're ${String(gap)} ahead of ${themName}.`
    : `${themName} is ${String(gap)} ahead.`;
}

/** A season's matches per club: everyone plays everyone twice. */
const SEASON_MATCHES = (TOTAL_TEAMS - 1) * 2;

/**
 * True only once every club has played its full season -- the standings
 * are a live table until then, so the copy says "now", not "finished"
 * (D13). `minPlayed` is the fewest matches any club has played.
 */
export function isSeasonOver(minPlayed: number | null): boolean {
  return minPlayed !== null && minPlayed >= SEASON_MATCHES;
}

/**
 * The peer-visibility rule: no other player's table is visible before the
 * Predict the Table deadline, and every submitted one is from it on. `now`
 * must be database time -- never a client clock (CLAUDE.md).
 */
export function arePeerTablesVisible(now: Date): boolean {
  return now.getTime() >= TABLE_PREDICTION_DEADLINE.getTime();
}
