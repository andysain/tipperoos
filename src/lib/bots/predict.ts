/**
 * Bot pick generation — the three surviving bot types from the retired World
 * Cup app, ported rather than reinvented (issue #35; original at
 * `git show worldcup-2026-final:src/tipperoos/services/admin_ops.py`,
 * bot_prediction_for_match :467-493). The ELO bot is dropped, per CLAUDE.md
 * and the `valid_bot_type` check constraint.
 *
 * Pure and Supabase-free on purpose: the write path lives in ./generate,
 * which is `server-only`. Everything here is a function of its arguments, so
 * the whole of each bot's behaviour is golden-value testable — see
 * ./predict.test.ts and docs/standards/TESTING_STANDARD.md §1a.
 */

/** Mirrors the `valid_bot_type` check on `players` (schema_v1.sql:71-73). */
export type BotType = "random" | "one_one" | "median";

export interface BotPick {
  homeScore: number;
  awayScore: number;
}

/** One human's submitted scoreline, as the Median Bot consumes it. */
export interface HumanPick {
  homeScore: number;
  awayScore: number;
}

/**
 * The old app's weighted plausible-scoreline pool, ported verbatim
 * (worldcup-2026-final:src/tipperoos/core/constants.py:91). Drawn from
 * independently per side. The weighting is the point: a uniform 0-4 would
 * produce 3-4 scorelines routinely and read as broken rather than plausible.
 */
export const SCORE_POOL = [0, 0, 1, 1, 1, 2, 2, 3] as const;

/**
 * Same 0-9 per-side bound the human pick route enforces
 * (src/app/api/picks/route.ts:13-14). The DB check is only `>= 0`
 * (schema_v1.sql:119), so without this a direct write could put an
 * out-of-range value on the pick board. No bot type can currently produce
 * one — this is a guard against future drift, not a live bug.
 */
const MIN_SCORE = 0;
const MAX_SCORE = 9;

/** Injected so the Random Bot is testable at all; defaults to Math.random. */
export type Rng = () => number;

export interface BotPickInput {
  humanPicks: HumanPick[];
  rng?: Rng;
}

function clampScore(value: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, value));
}

function drawFromPool(rng: Rng): number {
  return SCORE_POOL[Math.floor(rng() * SCORE_POOL.length)];
}

/**
 * A random plausible scoreline, each side drawn independently — two draws,
 * never one shared (a shared draw would make every Random Bot pick a draw).
 */
export function randomBotPick(rng: Rng): BotPick {
  return {
    homeScore: clampScore(drawFromPool(rng)),
    awayScore: clampScore(drawFromPool(rng)),
  };
}

export function oneOneBotPick(): BotPick {
  return { homeScore: 1, awayScore: 1 };
}

/**
 * Half-up rounding, deliberately not the banker's rounding Python's `round()`
 * gave the old app — that was incidental to the language, and half-up is the
 * behaviour a ten-year-old predicts (issue #35 D8).
 */
function medianHalfUp(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  const raw =
    sorted.length % 2 === 1
      ? sorted[Math.floor(middle)]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(raw);
}

/**
 * The crowd's centre, each side medianed independently — so the result can
 * be a scoreline nobody actually submitted, which is correct: it's a
 * consensus reference, not a vote for one player's pick.
 *
 * `humanPicks` must already exclude bots and be scoped to one competition —
 * ./generate owns both filters (ADR 0009; ADR 0004's match_id-without-
 * competition_id leak). With no human picks at all this falls back to 1-1,
 * faithfully porting admin_ops.py:481-486. Accepted consequence: in such a
 * week the Median Bot's pick is identical to the 1-1 Bot's.
 */
export function medianBotPick(humanPicks: HumanPick[]): BotPick {
  if (humanPicks.length === 0) return oneOneBotPick();

  return {
    homeScore: clampScore(medianHalfUp(humanPicks.map((p) => p.homeScore))),
    awayScore: clampScore(medianHalfUp(humanPicks.map((p) => p.awayScore))),
  };
}

export function botPickFor(botType: BotType, input: BotPickInput): BotPick {
  switch (botType) {
    case "random":
      return randomBotPick(input.rng ?? Math.random);
    case "one_one":
      return oneOneBotPick();
    case "median":
      return medianBotPick(input.humanPicks);
  }
}
