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
// membership match, max 200. See docs/adr/0003-predict-the-table-shape.md.

// A synthetic 20-team final table: T1 = champion ... T20 = last.
const ACTUAL_TABLE = Array.from({ length: 20 }, (_, i) => `T${i + 1}`);

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
    const result = scorePredictTable(ACTUAL_TABLE, ACTUAL_TABLE);
    expect(result.totalScore).toBe(200);
    expect(result.teamScores["T1"]).toBe(6);
    expect(result.teamScores["T20"]).toBe(6);
    expect(result.bandBonuses["Champion"]).toBe(20);
    expect(result.bandBonuses["Relegated"]).toBe(10);
  });

  it("is unaffected by reordering teams within a Band (order within a Band carries no scoring weight)", () => {
    // Swap the two Champions League teams T2 and T3, which are both still
    // in the Champions League Band -- CLAUDE.md: "Order within a Band
    // carries no scoring weight and isn't meaningfully captured."
    const predicted = [...ACTUAL_TABLE];
    [predicted[1], predicted[2]] = [predicted[2], predicted[1]];
    const result = scorePredictTable(predicted, ACTUAL_TABLE);
    expect(result.totalScore).toBe(200);
  });

  it("scores a fully reversed prediction at 56 (worked example, no Band Bonuses earned)", () => {
    const reversed = [...ACTUAL_TABLE].reverse();
    const result = scorePredictTable(reversed, ACTUAL_TABLE);
    expect(result.totalScore).toBe(56);
    expect(Object.values(result.bandBonuses).every((b) => b === 0)).toBe(true);
  });

  it("scores a Champion/Relegated-last swap at 158 (worked example: distance scoring + partial Band Bonuses)", () => {
    // Only T1 (actual champion) and T20 (actual last) swap positions;
    // everyone else stays exactly where they actually finished.
    const predicted = [...ACTUAL_TABLE];
    [predicted[0], predicted[19]] = [predicted[19], predicted[0]];
    const result = scorePredictTable(predicted, ACTUAL_TABLE);

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

  it("throws if either ordering doesn't have exactly 20 teams", () => {
    expect(() =>
      scorePredictTable(ACTUAL_TABLE.slice(0, 19), ACTUAL_TABLE),
    ).toThrow();
    expect(() =>
      scorePredictTable(ACTUAL_TABLE, [...ACTUAL_TABLE, "T21"]),
    ).toThrow();
  });

  it("throws if a predicted team isn't present in the actual table", () => {
    const predicted = [...ACTUAL_TABLE.slice(0, 19), "Not A Real Team"];
    expect(() => scorePredictTable(predicted, ACTUAL_TABLE)).toThrow();
  });
});
