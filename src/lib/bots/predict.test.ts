import { describe, expect, it } from "vitest";
import {
  SCORE_POOL,
  botPickFor,
  medianBotPick,
  oneOneBotPick,
  randomBotPick,
} from "./predict";

// Golden values hand-derived from issue #35's D6/D8/D9/D10 and the ported
// logic at `git show worldcup-2026-final:src/tipperoos/services/admin_ops.py`
// (bot_prediction_for_match, :467-493).
//
// SCORE_POOL = [0, 0, 1, 1, 1, 2, 2, 3] (length 8), so a draw is
// SCORE_POOL[floor(rng * 8)]:
//   rng 0.00 -> idx 0 -> 0     rng 0.50 -> idx 4 -> 1
//   rng 0.20 -> idx 1 -> 0     rng 0.70 -> idx 5 -> 2
//   rng 0.30 -> idx 2 -> 1     rng 0.80 -> idx 6 -> 2
//   rng 0.45 -> idx 3 -> 1     rng 0.90 -> idx 7 -> 3

/** Deterministic stand-in for Math.random: replays a fixed sequence. */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) {
      throw new Error("seededRng exhausted -- more draws than expected");
    }
    return values[i++];
  };
}

describe("SCORE_POOL", () => {
  it("is the old app's weighted pool, ported verbatim (D6)", () => {
    // A uniform 0-4 would produce 3-4 scorelines routinely and read as
    // broken; the weighting is what "plausible" meant in the old app.
    expect([...SCORE_POOL]).toEqual([0, 0, 1, 1, 1, 2, 2, 3]);
    expect(SCORE_POOL.length).toBe(8);
  });

  it("caps a single side at 3, so the Random Bot can never breach the 0-9 bound (D10)", () => {
    expect(Math.max(...SCORE_POOL)).toBe(3);
    expect(Math.min(...SCORE_POOL)).toBe(0);
  });
});

describe("randomBotPick", () => {
  it("draws each side independently, in home-then-away order", () => {
    const pick = randomBotPick(seededRng([0.3, 0.9]));

    expect(pick.homeScore).toBe(1);
    expect(pick.awayScore).toBe(3);
  });

  it("maps the bottom of the rng range to the pool's low end", () => {
    const pick = randomBotPick(seededRng([0, 0.2]));

    expect(pick.homeScore).toBe(0);
    expect(pick.awayScore).toBe(0);
  });

  it("maps the top of the rng range to the pool's high end", () => {
    const pick = randomBotPick(seededRng([0.99, 0.7]));

    expect(pick.homeScore).toBe(3);
    expect(pick.awayScore).toBe(2);
  });

  it("stays inside the pool when an rng returns exactly 1", () => {
    // Math.random() is always < 1, so this is only reachable via an injected
    // rng -- but indexing past the pool yields undefined -> NaN, which would
    // hit the DB as a NOT NULL violation rather than a bad pick.
    const pick = randomBotPick(() => 1);

    expect(pick.homeScore).toBe(3);
    expect(pick.awayScore).toBe(3);
  });

  it("consumes exactly two draws per pick -- one per side, never one shared", () => {
    // A shared draw would make every Random Bot pick a draw. The seeded rng
    // throws once exhausted, so two values being enough proves it takes two.
    const rng = seededRng([0.45, 0.5]);
    const pick = randomBotPick(rng);

    expect(pick.homeScore).toBe(1);
    expect(pick.awayScore).toBe(1);
    expect(() => rng()).toThrow();
  });
});

describe("oneOneBotPick", () => {
  it("always predicts 1-1", () => {
    expect(oneOneBotPick().homeScore).toBe(1);
    expect(oneOneBotPick().awayScore).toBe(1);
  });
});

describe("medianBotPick", () => {
  it("takes the median of an odd number of human picks, per side", () => {
    // home [2, 1, 3] -> sorted [1, 2, 3] -> median 2
    // away [1, 0, 2] -> sorted [0, 1, 2] -> median 1
    const pick = medianBotPick([
      { homeScore: 2, awayScore: 1 },
      { homeScore: 1, awayScore: 0 },
      { homeScore: 3, awayScore: 2 },
    ]);

    expect(pick.homeScore).toBe(2);
    expect(pick.awayScore).toBe(1);
  });

  it("rounds a half-value median up, not to even (D8)", () => {
    // home [2, 3] -> median 2.5 -> 3 (half-up). Python's round() -- the old
    // app's -- is banker's rounding and would give 2 here. That was
    // incidental to the language, not a designed rule; half-up is the answer
    // a ten-year-old predicts.
    const pick = medianBotPick([
      { homeScore: 2, awayScore: 0 },
      { homeScore: 3, awayScore: 1 },
    ]);

    expect(pick.homeScore).toBe(3);
    expect(pick.awayScore).toBe(1); // [0, 1] -> median 0.5 -> 1
  });

  it("medians each side independently, never as a paired scoreline", () => {
    // home [0, 4] -> median 2; away [5, 1] -> sorted [1, 5] -> median 3.
    // The result 2-3 is a scoreline nobody actually submitted, which is
    // correct: it's the crowd's centre, not a vote for one pick.
    const pick = medianBotPick([
      { homeScore: 0, awayScore: 5 },
      { homeScore: 4, awayScore: 1 },
    ]);

    expect(pick.homeScore).toBe(2);
    expect(pick.awayScore).toBe(3);
  });

  it("falls back to 1-1 when nobody picked the match (D9)", () => {
    // Faithful port of admin_ops.py:481-486. In such a week the Median Bot
    // is identical to the 1-1 Bot -- looks like a bug, is not one.
    const pick = medianBotPick([]);

    expect(pick.homeScore).toBe(1);
    expect(pick.awayScore).toBe(1);
  });

  it("shifts when a bot's own pick is wrongly included -- why the caller must filter (D8)", () => {
    const humansOnly = [
      { homeScore: 0, awayScore: 0 },
      { homeScore: 1, awayScore: 1 },
      { homeScore: 2, awayScore: 2 },
    ];
    // A 1-1 Bot's own pick leaking in makes it 4 values: home [0,1,2,1] ->
    // sorted [0,1,1,2] -> median 1 (unchanged here), but adding a Random
    // Bot's 3-3 as well drags it up.
    const contaminated = [
      ...humansOnly,
      { homeScore: 3, awayScore: 3 },
      { homeScore: 3, awayScore: 3 },
    ];

    expect(medianBotPick(humansOnly).homeScore).toBe(1);
    expect(medianBotPick(contaminated).homeScore).toBe(2);
  });

  it("clamps an implausible crowd median to the 0-9 bound (D10)", () => {
    // Unreachable through the pick route (which validates 0-9), so this is
    // a guard against future drift, not a live bug.
    const pick = medianBotPick([
      { homeScore: 40, awayScore: 0 },
      { homeScore: 40, awayScore: 0 },
    ]);

    expect(pick.homeScore).toBe(9);
    expect(pick.awayScore).toBe(0);
  });
});

describe("botPickFor", () => {
  it("dispatches on bot type", () => {
    const humanPicks = [
      { homeScore: 2, awayScore: 2 },
      { homeScore: 2, awayScore: 0 },
      { homeScore: 2, awayScore: 1 },
    ];

    expect(
      botPickFor("random", { humanPicks, rng: seededRng([0.9, 0]) }).homeScore,
    ).toBe(3);
    expect(botPickFor("one_one", { humanPicks }).homeScore).toBe(1);
    expect(botPickFor("median", { humanPicks }).homeScore).toBe(2);
    expect(botPickFor("median", { humanPicks }).awayScore).toBe(1);
  });

  it("defaults its rng to Math.random so only tests need to pass one", () => {
    const pick = botPickFor("random", { humanPicks: [] });

    expect(pick.homeScore).toBeGreaterThanOrEqual(0);
    expect(pick.homeScore).toBeLessThanOrEqual(3);
  });
});
