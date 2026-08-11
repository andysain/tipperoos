import { describe, expect, it } from "vitest";
import {
  CHAMPION_BAND_BONUS,
  CHAMPION_BAND_INDEX,
  MAX_PREDICT_TABLE_SCORE,
  PER_BAND_BONUS,
  TABLE_BANDS,
  TOTAL_TEAMS,
  bandIndexForRank,
  scorePredictTable,
  teamScore,
} from "./predict-table";

// Golden values hand-derived from CLAUDE.md -> "Predict the Table":
// 7 Bands (Champion 1 / Champions League 4 / Europe 3 / Mid Table 3 /
// Lower Table 3 / Relegation Battle 3 / Relegated 3), per-team score
// (7 - band_distance) - 1, Band Bonus +10 (+20 for Champion) for exact
// membership match, max 200. A prediction is a team -> Band index map whose
// Bands may be any size (docs/adr/0008-predict-the-table-group-fill-capture.md);
// only the actual final table is a full 1-20 ordering.
// See docs/adr/0003-predict-the-table-shape.md.

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

describe("constants", () => {
  it("has 7 Table Bands summing to 20 teams", () => {
    expect(TABLE_BANDS.length).toBe(7);
    expect(TOTAL_TEAMS).toBe(20);
  });

  it("has the documented Band sizes in order", () => {
    expect(TABLE_BANDS.map((b) => b.size)).toEqual([1, 4, 3, 3, 3, 3, 3]);
  });

  it("Champion is Band index 0, and bonuses match CLAUDE.md", () => {
    expect(CHAMPION_BAND_INDEX).toBe(0);
    expect(PER_BAND_BONUS).toBe(10);
    expect(CHAMPION_BAND_BONUS).toBe(20);
  });

  it("max score is 200", () => {
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
  it("is 6 for an exact Band match (distance 0)", () => {
    expect(teamScore(0, 0)).toBe(6);
    expect(teamScore(3, 3)).toBe(6);
  });

  it("is 0 for the maximum distance (Champion vs Relegated)", () => {
    expect(teamScore(0, 6)).toBe(0);
    expect(teamScore(6, 0)).toBe(0);
  });

  it("decreases by 1 per Band of distance", () => {
    expect(teamScore(2, 5)).toBe(3); // distance 3 -> 6 - 3
    expect(teamScore(1, 2)).toBe(5); // distance 1 -> 6 - 1
  });
});

describe("scorePredictTable", () => {
  it("scores a perfect prediction at the maximum, 200", () => {
    const result = scorePredictTable(PERFECT_PREDICTION, ACTUAL_TABLE);
    expect(result.totalScore).toBe(200);
    expect(result.teamScores["T1"]).toBe(6);
    expect(result.teamScores["T20"]).toBe(6);
    expect(result.bandBonuses["Champion"]).toBe(20);
    expect(result.bandBonuses["Relegated"]).toBe(10);
  });

  it("scores a fully reversed prediction at 56 (no Band Bonuses earned)", () => {
    const result = scorePredictTable(REVERSED_PREDICTION, ACTUAL_TABLE);
    expect(result.totalScore).toBe(56);
    expect(Object.values(result.bandBonuses).every((b) => b === 0)).toBe(true);
  });

  it("scores a Champion/Relegated-last swap at 158 (worked example: distance scoring + partial Band Bonuses)", () => {
    // Only T1 (actual champion) and T20 (actual last) swap Bands; everyone
    // else stays exactly where they actually finished.
    const swapped = new Map(PERFECT_PREDICTION);
    swapped.set("T1", 6);
    swapped.set("T20", 0);
    const result = scorePredictTable(swapped, ACTUAL_TABLE);

    expect(result.totalScore).toBe(158);
    expect(result.teamScores["T1"]).toBe(0); // predicted Relegated, actually Champion
    expect(result.teamScores["T20"]).toBe(0); // predicted Champion, actually Relegated
    expect(result.teamScores["T10"]).toBe(6); // untouched, exact Band match

    // Champion and Relegated Bands both lose their membership match; the
    // 5 untouched Bands in between still match exactly.
    expect(result.bandBonuses["Champion"]).toBe(0);
    expect(result.bandBonuses["Relegated"]).toBe(0);
    expect(result.bandBonuses["Champions League"]).toBe(10);
    expect(result.bandBonuses["Mid Table"]).toBe(10);
  });

  it("scores an under-filled prediction: unplaced teams get 0 and the empty Band forfeits its bonus", () => {
    // T1 (Champion) left unplaced; every other team in its exact actual
    // Band. 19 teams x 6 = 114, plus the 6 exact Bands' bonuses (60) --
    // the empty Champion Band forfeits its 20.
    const underFilled = new Map(PERFECT_PREDICTION);
    underFilled.delete("T1");
    const result = scorePredictTable(underFilled, ACTUAL_TABLE);

    expect(result.totalScore).toBe(174);
    expect(result.teamScores["T1"]).toBe(0);
    expect(result.teamScores["T2"]).toBe(6);
    expect(result.bandBonuses["Champion"]).toBe(0);
    expect(result.bandBonuses["Champions League"]).toBe(10);
  });

  it("scores an over-filled prediction: placed teams still score band distance, the oversized Band forfeits its bonus", () => {
    // Five teams in Champions League (T2-T6); T6's actual Band is Europe.
    // T6 scores 5 (one Band off), everyone else 6; Champion stays exact
    // (+20), Champions League and Europe forfeit, the other four Bands keep
    // +10 each.
    const overFilled = new Map(PERFECT_PREDICTION);
    overFilled.set("T6", 1);
    const result = scorePredictTable(overFilled, ACTUAL_TABLE);

    expect(result.totalScore).toBe(179);
    expect(result.teamScores["T6"]).toBe(5); // predicted CL, actually Europe
    expect(result.teamScores["T5"]).toBe(6);
    expect(result.bandBonuses["Champion"]).toBe(20);
    expect(result.bandBonuses["Champions League"]).toBe(0);
    expect(result.bandBonuses["Europe"]).toBe(0);
    expect(result.bandBonuses["Mid Table"]).toBe(10);
  });

  it("unplacing one team from a perfect prediction costs its team points plus that Band's bonus", () => {
    // An invariant: 200 - 6 (team points) = 194, minus the forfeited Band
    // bonus -- 10 for a regular Band, 20 for Champion.
    for (const team of ["T2", "T10", "T15"]) {
      const prediction = new Map(PERFECT_PREDICTION);
      prediction.delete(team);
      expect(scorePredictTable(prediction, ACTUAL_TABLE).totalScore).toBe(184);
    }
    const withoutChampion = new Map(PERFECT_PREDICTION);
    withoutChampion.delete("T1");
    expect(scorePredictTable(withoutChampion, ACTUAL_TABLE).totalScore).toBe(174);
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
    const prediction = new Map(PERFECT_PREDICTION);
    prediction.set("Not A Real Team", 0);
    expect(() => scorePredictTable(prediction, ACTUAL_TABLE)).toThrow();
  });

  it("throws if a predicted Band index is outside 0-6", () => {
    for (const badIndex of [7, -1, 1.5]) {
      const prediction = new Map(PERFECT_PREDICTION);
      prediction.set("T1", badIndex);
      expect(() => scorePredictTable(prediction, ACTUAL_TABLE)).toThrow();
    }
  });
});
