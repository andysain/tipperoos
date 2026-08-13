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

// Golden values hand-derived from CLAUDE.md -> "Predict the Table" and
// docs/adr/0010-predict-the-table-scoring.md: 7 Bands (Champion 1 /
// Champions League 4 / Europe 3 / Mid Table 3 / Lower Table 3 / Relegation
// Battle 3 / Relegated 3); placement 5/2/1/0 by Band distance; Band Bonus
// 15 for Champion, Champions League and Relegated, 10 for the rest; Bold
// Call +3 for a correct placement made by no more than roughly one in ten of
// the frozen cohort.
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
  ["T2", 1], // Champions League
  ["T3", 1],
  ["T4", 1],
  ["T5", 1],
  ["T6", 2], // Europe
  ["T7", 2],
  ["T8", 2],
  ["T9", 3], // Mid Table
  ["T10", 3],
  ["T11", 3],
  ["T12", 4], // Lower Table
  ["T13", 4],
  ["T14", 4],
  ["T15", 5], // Relegation Battle
  ["T16", 5],
  ["T17", 5],
  ["T18", 6], // Relegated
  ["T19", 6],
  ["T20", 6],
]);

// The mirror image of the perfect prediction: T1 predicted Relegated ...
// T20 predicted Champion (the map form of the reversed ordering).
const REVERSED_PREDICTION = new Map<string, number>([
  ["T1", 6],
  ["T2", 6],
  ["T3", 6],
  ["T4", 5],
  ["T5", 5],
  ["T6", 5],
  ["T7", 4],
  ["T8", 4],
  ["T9", 4],
  ["T10", 3],
  ["T11", 3],
  ["T12", 3],
  ["T13", 2],
  ["T14", 2],
  ["T15", 2],
  ["T16", 1],
  ["T17", 1],
  ["T18", 1],
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
  it("has 7 Table Bands summing to 20 teams", () => {
    expect(TABLE_BANDS.length).toBe(7);
    expect(TOTAL_TEAMS).toBe(20);
  });

  it("has the documented Band sizes in order", () => {
    expect(TABLE_BANDS.map((b) => b.size)).toEqual([1, 4, 3, 3, 3, 3, 3]);
  });

  it("pays 15 on the three key Bands and 10 on the rest", () => {
    expect(CHAMPION_BAND_INDEX).toBe(0);
    expect(
      Object.fromEntries(TABLE_BANDS.map((b) => [b.name, b.bonus])),
    ).toEqual({
      Champion: 15,
      "Champions League": 15,
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
    expect(bandIndexForRank(2)).toBe(1); // Champions League
    expect(bandIndexForRank(5)).toBe(1);
    expect(bandIndexForRank(6)).toBe(2); // Europe
    expect(bandIndexForRank(8)).toBe(2);
    expect(bandIndexForRank(9)).toBe(3); // Mid Table
    expect(bandIndexForRank(11)).toBe(3);
    expect(bandIndexForRank(12)).toBe(4); // Lower Table
    expect(bandIndexForRank(14)).toBe(4);
    expect(bandIndexForRank(15)).toBe(5); // Relegation Battle
    expect(bandIndexForRank(17)).toBe(5);
    expect(bandIndexForRank(18)).toBe(6); // Relegated
    expect(bandIndexForRank(20)).toBe(6);
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
      [0, 6],
      [6, 0],
      [6, 2],
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
    expect(result.bandBonuses["Champion"]).toBe(15);
    expect(result.bandBonuses["Mid Table"]).toBe(10);
    // Bold Calls need the cohort, so this entry point never awards them.
    expect(result.boldCalls).toEqual([]);
    expect(result.boldCallScore).toBe(0);
  });

  it("scores a fully reversed prediction at 18 (no Band Bonuses earned)", () => {
    // Only the 8 teams within 2 Bands of their reversed position score at
    // all: T10/T11 exact (5 each), T9/T12 one out (2 each), T7/T8/T13/T14
    // two out (1 each) = 18.
    const result = scorePredictTable(REVERSED_PREDICTION, ACTUAL_TABLE);
    expect(result.totalScore).toBe(18);
    expect(result.teamScores["T10"]).toBe(5);
    expect(result.teamScores["T9"]).toBe(2);
    expect(result.teamScores["T7"]).toBe(1);
    expect(result.teamScores["T1"]).toBe(0);
    expect(Object.values(result.bandBonuses).every((b) => b === 0)).toBe(true);
  });

  it("scores a Champion/Relegated swap at 145", () => {
    // T1 and T20 swap Bands; everyone else stays exactly right.
    // 18 x 5 = 90 placement (T1 and T20 are 6 Bands out, so 0 each), plus
    // the 5 untouched Bands' bonuses (15 + 10 + 10 + 10 + 10 = 55).
    const swapped = perfectExcept("T1", 6);
    swapped.set("T20", 0);
    const result = scorePredictTable(swapped, ACTUAL_TABLE);

    expect(result.totalScore).toBe(145);
    expect(result.teamScores["T1"]).toBe(0);
    expect(result.teamScores["T20"]).toBe(0);
    expect(result.teamScores["T10"]).toBe(5);
    expect(result.bandBonuses["Champion"]).toBe(0);
    expect(result.bandBonuses["Relegated"]).toBe(0);
    expect(result.bandBonuses["Champions League"]).toBe(15);
    expect(result.bandBonuses["Mid Table"]).toBe(10);
  });

  it("scores an under-filled prediction: unplaced teams get 0 and the empty Band forfeits its bonus", () => {
    // T1 left unplaced: 19 x 5 = 95 placement, and the Champion Band
    // forfeits its 15, leaving 70 of the 85 in bonuses.
    const underFilled = new Map(PERFECT_PREDICTION);
    underFilled.delete("T1");
    const result = scorePredictTable(underFilled, ACTUAL_TABLE);

    expect(result.totalScore).toBe(165);
    expect(result.teamScores["T1"]).toBe(0);
    expect(result.teamScores["T2"]).toBe(5);
    expect(result.bandBonuses["Champion"]).toBe(0);
    expect(result.bandBonuses["Champions League"]).toBe(15);
  });

  it("scores an over-filled prediction: placed teams still score distance, the oversized Band forfeits its bonus", () => {
    // Five teams in Champions League (T2-T6); T6 actually finishes in
    // Europe, so it scores 2 rather than 5. Champions League is oversized
    // and Europe undersized, so both forfeit; the other five Bands keep
    // theirs (15 + 10 + 10 + 10 + 15 = 60).
    const result = scorePredictTable(perfectExcept("T6", 1), ACTUAL_TABLE);

    expect(result.totalScore).toBe(157);
    expect(result.placementScore).toBe(97);
    expect(result.teamScores["T6"]).toBe(2);
    expect(result.teamScores["T5"]).toBe(5);
    expect(result.bandBonuses["Champion"]).toBe(15);
    expect(result.bandBonuses["Champions League"]).toBe(0);
    expect(result.bandBonuses["Europe"]).toBe(0);
    expect(result.bandBonuses["Mid Table"]).toBe(10);
  });

  it("unplacing one team from a perfect prediction costs 5 plus that Band's bonus", () => {
    // An invariant rather than a worked example: 185 - 5 - the forfeited
    // bonus, which is 15 on a key Band and 10 elsewhere.
    for (const team of ["T10", "T15"]) {
      const prediction = new Map(PERFECT_PREDICTION);
      prediction.delete(team);
      expect(scorePredictTable(prediction, ACTUAL_TABLE).totalScore).toBe(170);
    }
    for (const team of ["T1", "T2", "T18"]) {
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

  it("throws if a predicted Band index is outside 0-6", () => {
    for (const badIndex of [7, -1, 1.5]) {
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
        ...Array.from({ length: 5 }, () => perfectExcept("T10", 4)),
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
        if (index >= 2) prediction.set("T7", 3);
        if (index >= 1) prediction.set("T8", 3);
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
