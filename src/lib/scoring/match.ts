/**
 * Additive match scoring — issue #21. The formula is defined once, in
 * CLAUDE.md's "Scoring — additive" section, and this module is the single
 * implementation of it (a "one-function swap", per BUILD_PLAN.md decision 43).
 * Golden values in the test file are hand-derived from that prose.
 *
 * All terms stack: correct result, correct goal difference, each side's
 * score (both only on a correct result), and Wrong Way Round for the exact
 * scoreline with the sides swapped. There is deliberately no exact-scoreline
 * bonus — see docs/adr/0009, which records what the formula does not reward.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The four stackable term values; every number in this module traces back here. */
export const RESULT_POINTS = 3;
export const GOAL_DIFFERENCE_POINTS = 2;
export const TEAM_SCORE_POINTS = 1;
export const WRONG_WAY_ROUND_POINTS = 1;
export const NO_PICK_POINTS = 0;

export interface MatchScoringTerm {
  readonly label: string;
  readonly points: number;
}

/** The weekly scoring ladder, in CLAUDE.md's order. */
export const MATCH_SCORING_TERMS: readonly MatchScoringTerm[] = [
  { label: "Right result", points: RESULT_POINTS },
  { label: "Right goal difference", points: GOAL_DIFFERENCE_POINTS },
  { label: "Home team's score", points: TEAM_SCORE_POINTS },
  { label: "Away team's score", points: TEAM_SCORE_POINTS },
];

export interface MatchScoringBreakdown {
  /** Points when the result (win/draw/loss) is right, else null. */
  result: number | null;
  /** Points when both the result and the goal difference are right, else null. */
  goalDifference: number | null;
  /** Points when the result is right and the home score is right, else null. */
  homeScore: number | null;
  /** Points when the result is right and the away score is right, else null. */
  awayScore: number | null;
  /** The exact scoreline with the sides swapped; mutually exclusive with every other term. */
  wrongWayRound: boolean;
}

export interface MatchScore {
  /** False when no pick row exists — no pick, no points. */
  hasPick: boolean;
  breakdown: MatchScoringBreakdown;
  points: number;
}

export function scoreMatch(
  pickHome: number | null,
  pickAway: number | null,
  resultHome: number,
  resultAway: number,
): MatchScore {
  if (pickHome === null || pickAway === null) {
    return {
      hasPick: false,
      breakdown: {
        result: null,
        goalDifference: null,
        homeScore: null,
        awayScore: null,
        wrongWayRound: false,
      },
      points: NO_PICK_POINTS,
    };
  }

  const wrongWayRound =
    pickHome === resultAway && pickAway === resultHome && pickHome !== pickAway;

  if (wrongWayRound) {
    return {
      hasPick: true,
      breakdown: {
        result: null,
        goalDifference: null,
        homeScore: null,
        awayScore: null,
        wrongWayRound: true,
      },
      points: WRONG_WAY_ROUND_POINTS,
    };
  }

  const pickResult = Math.sign(pickHome - pickAway);
  const actualResult = Math.sign(resultHome - resultAway);
  const resultRight = pickResult === actualResult;

  const result = resultRight ? RESULT_POINTS : null;
  const goalDifference =
    resultRight && pickHome - pickAway === resultHome - resultAway
      ? GOAL_DIFFERENCE_POINTS
      : null;
  const homeScore =
    resultRight && pickHome === resultHome ? TEAM_SCORE_POINTS : null;
  const awayScore =
    resultRight && pickAway === resultAway ? TEAM_SCORE_POINTS : null;

  return {
    hasPick: true,
    breakdown: {
      result,
      goalDifference,
      homeScore,
      awayScore,
      wrongWayRound: false,
    },
    points:
      (result ?? 0) +
      (goalDifference ?? 0) +
      (homeScore ?? 0) +
      (awayScore ?? 0),
  };
}

export interface ScoreRow {
  playerId: string;
  matchId: string;
  points: number;
}

export interface MatchResult {
  home: number;
  away: number;
}

export interface RecomputeMatchScoresInput {
  matchId: string;
  /** The match's current authoritative result; null when it has none yet. */
  result: MatchResult | null;
  /** A voided match scores 0 for every picker. */
  voided: boolean;
  /** The players who hold a pick row for this match (picks are never null once a row exists). */
  picks: { playerId: string; pickHome: number; pickAway: number }[];
}

/**
 * The complete authoritative `scores` row set for one match, recomputed from
 * the match's current state (result + voided flag) and its players' picks.
 * Recompute-from-current, never a delta: the output is the full replacement
 * row set, so writing it with `writeScores` can never double-count.
 */
export function recomputeMatchScores(
  input: RecomputeMatchScoresInput,
): ScoreRow[] {
  const { matchId, picks, result, voided } = input;

  if (voided) {
    return picks.map((pick) => ({
      playerId: pick.playerId,
      matchId,
      points: NO_PICK_POINTS,
    }));
  }

  if (result === null) {
    return [];
  }

  return picks.map((pick) => ({
    playerId: pick.playerId,
    matchId,
    points: scoreMatch(pick.pickHome, pick.pickAway, result.home, result.away)
      .points,
  }));
}

/**
 * Writes the authoritative row set for a match into the `scores` ledger,
 * upserting on the `unique (player_id, match_id)` constraint — the idempotency
 * backbone of the whole engine: recompute the rows with `recomputeMatchScores`
 * and this overwrites, never adds. `computed_at` is refreshed so a recompute
 * is traceable. No rows is a no-op (a match not yet scored/voided).
 */
export async function writeScores(
  supabase: SupabaseClient,
  rows: ScoreRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase.from("scores").upsert(
    rows.map((row) => ({
      player_id: row.playerId,
      match_id: row.matchId,
      points: row.points,
      computed_at: new Date().toISOString(),
    })),
    { onConflict: "player_id,match_id" },
  );

  if (error) throw error;
}
