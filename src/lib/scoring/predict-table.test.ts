import { describe, expect, it } from "vitest";
import {
  BOLD_CALL_BONUS,
  CHAMPION_BAND_INDEX,
  MAX_BOLD_CALLS,
  MAX_PREDICT_TABLE_SCORE,
  PLACEMENT_POINTS_BY_DISTANCE,
  TABLE_BANDS,
  TOTAL_TEAMS,
  bandIndexForRank,
  scorePredictTable,
  scorePredictTableCohort,
  teamScore,
} from "./predict-table";

// Golden values: 8 Bands (Champion 1 / Runners Up 1 / Champions League 3 /
// Europe 3 / Mid Table 3 / Lower Table 3 / Relegation Battle 3 / Relegated
// 3); placement 5/2/1/0 by Band distance; Band Bonus 15 for Relegated and 10
// for the other seven; Bold Call +3 for a correct placement made by no more
// than roughly one in ten of the frozen cohort. See
// docs/adr/0011-predict-the-table-capture-v2.md.
// made, best 5. Max 100 + 85 + 15 = 200. A prediction is a team -> Band
// index map whose Bands may be any size
// (docs/adr/0008-predict-the-table-group-fill-capture.md); only the actual
// final table is a full 1-20 ordering.

// A synthetic 20-team final table: T1 = champion ... T20 = last.
const ACTUAL_TABLE = Array.from({ length: 20 }, (_, i) => `T${i + 1}`);

// The exact-correct prediction: every team in its actual Band (index 0 =
// Champion). Hand-written rather than derived, so the test reads as its own
// spec.
const PERFECT_PREDICTION = new Map<string, number>([
  ["T1", 0], // Champion
  ["T2", 1], // Runners Up
  ["T3", 2], // Champions League
  ["T4", 2],
  ["T5", 2],
  ["T6", 3], // Europe
  ["T7", 3],
  ["T8", 3],
  ["T9", 4], // Mid Table
  ["T10", 4],
  ["T11", 4],
  ["T12", 5], // Lower Table
  ["T13", 5],
  ["T14", 5],
  ["T15", 6], // Relegation Battle
  ["T16", 6],
  ["T17", 6],
  ["T18", 7], // Relegated
  ["T19", 7],
  ["T20", 7],
]);

// The mirror image of the perfect prediction: T1 predicted Relegated ...
// T20 predicted Champion (the map form of the reversed ordering).
const REVERSED_PREDICTION = new Map<string, number>([
  ["T1", 7],
  ["T2", 7],
  ["T3", 7],
  ["T4", 6],
  ["T5", 6],
  ["T6", 6],
  ["T7", 5],
  ["T8", 5],
  ["T9", 5],
  ["T10", 4],
  ["T11", 4],
  ["T12", 4],
  ["T13", 3],
  ["T14", 3],
  ["T15", 3],
  ["T16", 2],
  ["T17", 2],
  ["T18", 2],
  ["T19", 1],
  ["T20", 0],
]);

/** A perfect prediction with one team moved to a different Band. */
function perfectExcept(team: string, bandIndex: number): Map<string, number> {
  const prediction = new Map(PERFECT_PREDICTION);
  prediction.set(team, bandIndex);
  return prediction;
}

describe("constants", () => {
  it("has 8 Table Bands summing to 20 teams", () => {
    expect(TABLE_BANDS.length).toBe(8);
    expect(TOTAL_TEAMS).toBe(20);
  });

  it("has the documented Band sizes in order", () => {
    expect(TABLE_BANDS.map((b) => b.size)).toEqual([1, 1, 3, 3, 3, 3, 3, 3]);
  });

  it("pays 15 on Relegated and 10 on the other seven", () => {
    expect(CHAMPION_BAND_INDEX).toBe(0);
    expect(
      Object.fromEntries(TABLE_BANDS.map((b) => [b.name, b.bonus])),
    ).toEqual({
      Champion: 10,
      "Runners Up": 10,
      "Champions League": 10,
      Europe: 10,
      "Mid Table": 10,
      "Lower Table": 10,
      "Relegation Battle": 10,
      Relegated: 15,
    });
  });

  it("max score is 200: 100 placement + 85 Band Bonus + 15 Bold Call", () => {
    expect(PLACEMENT_POINTS_BY_DISTANCE).toEqual([5, 2, 1]);
    expect(TOTAL_TEAMS * PLACEMENT_POINTS_BY_DISTANCE[0]).toBe(100);
    expect(TABLE_BANDS.reduce((sum, b) => sum + b.bonus, 0)).toBe(85);
    expect(MAX_BOLD_CALLS * BOLD_CALL_BONUS).toBe(15);
    expect(MAX_PREDICT_TABLE_SCORE).toBe(200);
  });
});

describe("bandIndexForRank", () => {
  it("maps every documented rank range to its Band index", () => {
    expect(bandIndexForRank(1)).toBe(0); // Champion
    expect(bandIndexForRank(2)).toBe(1); // Runners Up
    expect(bandIndexForRank(3)).toBe(2); // Champions League
    expect(bandIndexForRank(5)).toBe(2);
    expect(bandIndexForRank(6)).toBe(3); // Europe
    expect(bandIndexForRank(8)).toBe(3);
    expect(bandIndexForRank(9)).toBe(4); // Mid Table
    expect(bandIndexForRank(11)).toBe(4);
    expect(bandIndexForRank(12)).toBe(5); // Lower Table
    expect(bandIndexForRank(14)).toBe(5);
    expect(bandIndexForRank(15)).toBe(6); // Relegation Battle
    expect(bandIndexForRank(17)).toBe(6);
    expect(bandIndexForRank(18)).toBe(7); // Relegated
    expect(bandIndexForRank(20)).toBe(7);
  });

  it("throws for a rank outside 1-20", () => {
    expect(() => bandIndexForRank(0)).toThrow();
    expect(() => bandIndexForRank(21)).toThrow();
  });
});

describe("teamScore", () => {
  it("pays 5 / 2 / 1 / 0 by Band distance", () => {
    expect(teamScore(3, 3)).toBe(5); // distance 0
    expect(teamScore(1, 2)).toBe(2); // distance 1
    expect(teamScore(2, 4)).toBe(1); // distance 2
    expect(teamScore(2, 5)).toBe(0); // distance 3 -- the cliff
  });

  it("pays 0 for anything 3 or more Bands out, however far", () => {
    for (const [predicted, actual] of [
      [0, 3],
      [0, 7],
      [7, 0],
      [7, 2],
    ]) {
      expect(teamScore(predicted, actual)).toBe(0);
    }
  });
});

describe("scorePredictTable", () => {
  it("scores a perfect prediction at 185 -- the maximum before Bold Calls", () => {
    const result = scorePredictTable(PERFECT_PREDICTION, ACTUAL_TABLE);
    expect(result.placementScore).toBe(100);
    expect(result.bandBonusScore).toBe(85);
    expect(result.totalScore).toBe(185);
    expect(result.teamScores["T1"]).toBe(5);
    expect(result.bandBonuses["Champion"]).toBe(10);
    expect(result.bandBonuses["Mid Table"]).toBe(10);
    // Bold Calls need the cohort, so this entry point never awards them.
    expect(result.boldCalls).toEqual([]);
    expect(result.boldCallScore).toBe(0);
  });

  it("scores a fully reversed prediction at 18 (no Band Bonuses earned)", () => {
    // Unchanged by the 8-Band remap, as it happens: the same 8 teams land
    // within 2 Bands of their reversed position. T10/T11 exact (5 each),
    // T9/T12 one out (2 each), T7/T8/T13/T14 two out (1 each) = 18.
    const result = scorePredictTable(REVERSED_PREDICTION, ACTUAL_TABLE);
    expect(result.totalScore).toBe(18);
    expect(result.teamScores["T10"]).toBe(5);
    expect(result.teamScores["T9"]).toBe(2);
    expect(result.teamScores["T7"]).toBe(1);
    expect(result.teamScores["T1"]).toBe(0);
    expect(Object.values(result.bandBonuses).every((b) => b === 0)).toBe(true);
  });

  it("scores a Champion/Relegated swap at 150", () => {
    // T1 and T20 swap Bands; everyone else stays exactly right.
    // 18 x 5 = 90 placement (T1 and T20 are 7 Bands out, so 0 each), plus
    // the 6 untouched Bands' bonuses (6 x 10 = 60).
    const swapped = perfectExcept("T1", 7);
    swapped.set("T20", 0);
    const result = scorePredictTable(swapped, ACTUAL_TABLE);

    expect(result.totalScore).toBe(150);
    expect(result.teamScores["T1"]).toBe(0);
    expect(result.teamScores["T20"]).toBe(0);
    expect(result.teamScores["T10"]).toBe(5);
    expect(result.bandBonuses["Champion"]).toBe(0);
    expect(result.bandBonuses["Relegated"]).toBe(0);
    expect(result.bandBonuses["Champions League"]).toBe(10);
    expect(result.bandBonuses["Mid Table"]).toBe(10);
  });

  it("scores an under-filled prediction: unplaced teams get 0 and the empty Band forfeits its bonus", () => {
    // T1 left unplaced: 19 x 5 = 95 placement, and the Champion Band
    // forfeits its 10, leaving 75 of the 85 in bonuses.
    const underFilled = new Map(PERFECT_PREDICTION);
    underFilled.delete("T1");
    const result = scorePredictTable(underFilled, ACTUAL_TABLE);

    expect(result.totalScore).toBe(170);
    expect(result.teamScores["T1"]).toBe(0);
    expect(result.teamScores["T2"]).toBe(5);
    expect(result.bandBonuses["Champion"]).toBe(0);
    expect(result.bandBonuses["Champions League"]).toBe(10);
  });

  it("scores an over-filled prediction: placed teams still score distance, the oversized Band forfeits its bonus", () => {
    // Four teams in Champions League (T3-T6); T6 actually finishes in
    // Europe, so it scores 2 rather than 5. Champions League is oversized
    // and Europe undersized, so both forfeit; the other six Bands keep
    // theirs (5 x 10 + 15 = 65).
    const result = scorePredictTable(perfectExcept("T6", 2), ACTUAL_TABLE);

    expect(result.totalScore).toBe(162);
    expect(result.placementScore).toBe(97);
    expect(result.teamScores["T6"]).toBe(2);
    expect(result.teamScores["T5"]).toBe(5);
    expect(result.bandBonuses["Champion"]).toBe(10);
    expect(result.bandBonuses["Champions League"]).toBe(0);
    expect(result.bandBonuses["Europe"]).toBe(0);
    expect(result.bandBonuses["Mid Table"]).toBe(10);
  });

  it("unplacing one team from a perfect prediction costs 5 plus that Band's bonus", () => {
    // An invariant rather than a worked example: 185 - 5 - the forfeited
    // bonus, which is 15 on Relegated and 10 on every other Band.
    for (const team of ["T1", "T2", "T10", "T15"]) {
      const prediction = new Map(PERFECT_PREDICTION);
      prediction.delete(team);
      expect(scorePredictTable(prediction, ACTUAL_TABLE).totalScore).toBe(170);
    }
    for (const team of ["T18"]) {
      const prediction = new Map(PERFECT_PREDICTION);
      prediction.delete(team);
      expect(scorePredictTable(prediction, ACTUAL_TABLE).totalScore).toBe(165);
    }
  });

  it("throws if the actual ordering doesn't have exactly 20 teams", () => {
    expect(() =>
      scorePredictTable(PERFECT_PREDICTION, ACTUAL_TABLE.slice(0, 19)),
    ).toThrow();
    expect(() =>
      scorePredictTable(PERFECT_PREDICTION, [...ACTUAL_TABLE, "T21"]),
    ).toThrow();
  });

  it("throws if a predicted team isn't in the actual table", () => {
    expect(() =>
      scorePredictTable(perfectExcept("Not A Real Team", 0), ACTUAL_TABLE),
    ).toThrow();
  });

  it("throws if a predicted Band index is outside 0-7", () => {
    for (const badIndex of [8, -1, 1.5]) {
      expect(() =>
        scorePredictTable(perfectExcept("T1", badIndex), ACTUAL_TABLE),
      ).toThrow();
    }
  });
});

describe("scorePredictTableCohort -- Bold Calls", () => {
  /** n eligible entries, keyed P0..P(n-1). */
  function cohort(predictions: Map<string, number>[]) {
    return predictions.map((bands, index) => ({
      key: `P${index}`,
      bands,
      boldCallEligible: true,
    }));
  }

  it("awards +3 for a lone correct placement in a six-player cohort", () => {
    // Six players. Five put T10 in Lower Table; only P0 has it in Mid
    // Table, where it actually finishes. 1 of 6 is the only agreement, so P0
    // banks a Bold Call worth 3 on top of a perfect 185.
    const results = scorePredictTableCohort(
      cohort([
        PERFECT_PREDICTION,
        ...Array.from({ length: 5 }, () => perfectExcept("T10", 5)),
      ]),
      ACTUAL_TABLE,
    );

    expect(results.get("P0")!.boldCalls).toEqual(["T10"]);
    expect(results.get("P0")!.boldCallScore).toBe(3);
    expect(results.get("P0")!.totalScore).toBe(188);

    // The other five: T10 is one Band out (2), and both Mid Table and
    // Lower Table are the wrong size so both forfeit. 97 + 65 = 162.
    expect(results.get("P1")!.totalScore).toBe(162);
    expect(results.get("P1")!.boldCalls).toEqual([]);
  });

  it("does not award a placement the majority also made", () => {
    // Everyone perfect: every placement has 6 of 6 agreement, so nothing
    // is rare and nobody earns anything beyond the 185.
    const results = scorePredictTableCohort(
      cohort(Array.from({ length: 6 }, () => PERFECT_PREDICTION)),
      ACTUAL_TABLE,
    );
    for (const result of results.values()) {
      expect(result.totalScore).toBe(185);
      expect(result.boldCalls).toEqual([]);
    }
  });

  it("allows one agreement but not two in a twelve-player cohort", () => {
    // P0-P1 put T7 in Europe (correct, 2 of 12 -- not rare).
    // Only P0 puts T8 in Europe (correct, 1 of 12 -- rare).
    // Everyone else pushes those teams into Mid Table.
    const entries = cohort(
      Array.from({ length: 12 }, (_, index) => {
        const prediction = new Map(PERFECT_PREDICTION);
        if (index >= 2) prediction.set("T7", 4);
        if (index >= 1) prediction.set("T8", 4);
        return prediction;
      }),
    );
    const results = scorePredictTableCohort(entries, ACTUAL_TABLE);

    // P0 got both right, but only T8 was rare enough to pay.
    expect(results.get("P0")!.boldCalls).toEqual(["T8"]);
    expect(results.get("P0")!.totalScore).toBe(188);

    // P3 had both placements wrong -- no Bold Call at all.
    expect(results.get("P3")!.boldCalls).toEqual([]);
    expect(results.get("P3")!.totalScore).toBe(159);
  });

  it("allows two agreements in a twenty-player cohort", () => {
    const results = scorePredictTableCohort(
      cohort([
        PERFECT_PREDICTION,
        PERFECT_PREDICTION,
        ...Array.from({ length: 18 }, () => REVERSED_PREDICTION),
      ]),
      ACTUAL_TABLE,
    );

    expect(results.get("P0")!.boldCalls).toHaveLength(MAX_BOLD_CALLS);
    expect(results.get("P0")!.boldCallScore).toBe(15);
  });

  it("caps Bold Calls at 5, which is what makes 200 reachable", () => {
    // P0 is perfect; the other five are fully reversed, so they agree with
    // P0 only on T10 and T11. That leaves P0 with 18 rare correct
    // placements, capped to 5 -> 185 + 15 = 200.
    const results = scorePredictTableCohort(
      cohort([
        PERFECT_PREDICTION,
        ...Array.from({ length: 5 }, () => REVERSED_PREDICTION),
      ]),
      ACTUAL_TABLE,
    );

    expect(results.get("P0")!.boldCalls).toHaveLength(MAX_BOLD_CALLS);
    expect(results.get("P0")!.boldCallScore).toBe(15);
    expect(results.get("P0")!.totalScore).toBe(MAX_PREDICT_TABLE_SCORE);

    // T10/T11 are the two placements the reversed predictions share with
    // P0, so they're the majority view and never qualify.
    expect(results.get("P0")!.boldCalls).not.toContain("T10");
    expect(results.get("P1")!.boldCalls).toEqual([]);
    expect(results.get("P1")!.totalScore).toBe(18);
  });

  it("picks the same five every time when more than five qualify", () => {
    const entries = cohort([
      PERFECT_PREDICTION,
      ...Array.from({ length: 5 }, () => REVERSED_PREDICTION),
    ]);
    const first = scorePredictTableCohort(entries, ACTUAL_TABLE);
    const second = scorePredictTableCohort([...entries], ACTUAL_TABLE);
    expect(first.get("P0")!.boldCalls).toEqual(second.get("P0")!.boldCalls);
  });

  it("excludes a Late Joiner from Bold Calls without changing anyone else's score", () => {
    // The frozen cohort is P0 plus five reversed predictions; the Late
    // Joiner submits the same perfect prediction as P0 but sits outside
    // the process entirely.
    const frozen = cohort([
      PERFECT_PREDICTION,
      ...Array.from({ length: 5 }, () => REVERSED_PREDICTION),
    ]);
    const lateJoiner = {
      key: "late",
      bands: PERFECT_PREDICTION,
      boldCallEligible: false,
    };
    const results = scorePredictTableCohort(
      [...frozen, lateJoiner],
      ACTUAL_TABLE,
    );

    // Scored and ranked on placement and Band Bonus, but no Bold Calls.
    expect(results.get("late")!.totalScore).toBe(185);
    expect(results.get("late")!.boldCalls).toEqual([]);

    // And agreeing with P0 hasn't diluted P0's already-earned Bold Calls.
    expect(results.get("P0")!.totalScore).toBe(MAX_PREDICT_TABLE_SCORE);
  });

  it("awards nothing when every entry is a Late Joiner", () => {
    const results = scorePredictTableCohort(
      [
        { key: "a", bands: PERFECT_PREDICTION, boldCallEligible: false },
        { key: "b", bands: REVERSED_PREDICTION, boldCallEligible: false },
      ],
      ACTUAL_TABLE,
    );
    expect(results.get("a")!.totalScore).toBe(185);
    expect(results.get("b")!.totalScore).toBe(18);
    expect(results.get("b")!.boldCalls).toEqual([]);
  });
});
