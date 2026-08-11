import { describe, expect, it } from "vitest";
import {
  BAND_KEYS,
  TABLE_BANDS,
  TOTAL_TEAMS,
  getTablePredictionEditability,
  isBandKey,
  isLateJoiner,
  validateBandCounts,
} from "./rules";

// Golden values hand-derived from CLAUDE.md -> "Season-long feature: Predict
// the Table" and docs/adr/0003-predict-the-table-shape.md:
// "Champion (1), Champions League (2-5), Europe (6-8), Mid Table (9-11),
// Lower Table (12-14), Relegation Battle (15-17), Relegated (18-20)."
describe("TABLE_BANDS", () => {
  it("has the 7 bands in table order with their fixed target sizes", () => {
    expect(TABLE_BANDS.map((b) => b.key)).toEqual([
      "champion",
      "champions_league",
      "europe",
      "mid_table",
      "lower_table",
      "relegation_battle",
      "relegated",
    ]);
    expect(TABLE_BANDS[0].target).toBe(1);
    expect(TABLE_BANDS[1].target).toBe(4);
    expect(TABLE_BANDS[2].target).toBe(3);
    expect(TABLE_BANDS[3].target).toBe(3);
    expect(TABLE_BANDS[4].target).toBe(3);
    expect(TABLE_BANDS[5].target).toBe(3);
    expect(TABLE_BANDS[6].target).toBe(3);
  });

  it("targets sum to all 20 teams", () => {
    const sum = TABLE_BANDS.reduce((total, band) => total + band.target, 0);
    expect(sum).toBe(20);
    expect(TOTAL_TEAMS).toBe(20);
  });

  it("BAND_KEYS mirrors TABLE_BANDS order", () => {
    expect(BAND_KEYS.length).toBe(7);
    expect(BAND_KEYS).toEqual(TABLE_BANDS.map((b) => b.key));
  });
});

describe("isBandKey", () => {
  it("accepts every real band key", () => {
    for (const key of BAND_KEYS) {
      expect(isBandKey(key)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isBandKey("champions")).toBe(false);
    expect(isBandKey("")).toBe(false);
    expect(isBandKey("RELEGATED")).toBe(false);
  });
});

const fullTargetCounts = {
  champion: 1,
  champions_league: 4,
  europe: 3,
  mid_table: 3,
  lower_table: 3,
  relegation_battle: 3,
  relegated: 3,
};

describe("validateBandCounts", () => {
  it("is ok when every band exactly matches its target and all 20 are sorted", () => {
    const result = validateBandCounts(fullTargetCounts);
    expect(result.ok).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.unsortedCount).toBe(0);
  });

  it("flags an over-filled band and the resulting under-filled one, with expected/actual counts", () => {
    const result = validateBandCounts({
      ...fullTargetCounts,
      champions_league: 6,
      europe: 1,
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual([
      { band: "champions_league", expected: 4, actual: 6 },
      { band: "europe", expected: 3, actual: 1 },
    ]);
  });

  it("counts teams not yet placed in any band as unsorted, not a band mismatch", () => {
    const result = validateBandCounts({
      champion: 1,
      champions_league: 4,
      europe: 3,
      mid_table: 3,
      lower_table: 3,
      relegation_battle: 3,
      // relegated omitted entirely -- still sorting
    });
    expect(result.ok).toBe(false);
    expect(result.unsortedCount).toBe(3);
    expect(result.mismatches).toEqual([
      { band: "relegated", expected: 3, actual: 0 },
    ]);
  });

  it("treats an empty count map as everything unsorted", () => {
    const result = validateBandCounts({});
    expect(result.ok).toBe(false);
    expect(result.unsortedCount).toBe(20);
    expect(result.mismatches.length).toBe(7);
  });

  // Submission never blocks on this result (docs/adr/0008-predict-the-table-group-fill-capture.md)
  // -- validateBandCounts just reports, however wrong the board is; it
  // never throws or refuses to compute a result.
  it("reports cleanly on a maximally-wrong assignment instead of throwing", () => {
    const result = validateBandCounts({ champion: 20 });
    expect(result.ok).toBe(false);
    expect(result.unsortedCount).toBe(0);
    expect(result.mismatches.length).toBe(7);
  });
});

// Golden values hand-derived from CLAUDE.md -> "Late joiners": "a player who
// signs up ... after gameweek 1 has begun" is a Late Joiner (never locked,
// can submit any time or skip); an on-time player is locked once "Gameweek
// 1's first kickoff" passes.
const GW1_KICKOFF = new Date("2026-08-15T19:00:00.000Z");

describe("isLateJoiner", () => {
  it("is false when there's no known gameweek-1 kickoff yet (season not seeded)", () => {
    expect(isLateJoiner(new Date("2026-08-01T00:00:00.000Z"), null)).toBe(
      false,
    );
  });

  it("is false for a player who joined before gameweek 1 began", () => {
    expect(
      isLateJoiner(new Date("2026-08-01T00:00:00.000Z"), GW1_KICKOFF),
    ).toBe(false);
  });

  it("is true for a player who joined after gameweek 1's first kickoff", () => {
    expect(
      isLateJoiner(new Date("2026-09-01T00:00:00.000Z"), GW1_KICKOFF),
    ).toBe(true);
  });

  it("is false for a player who joined at the exact kickoff instant", () => {
    expect(isLateJoiner(GW1_KICKOFF, GW1_KICKOFF)).toBe(false);
  });
});

describe("getTablePredictionEditability", () => {
  it("on-time player, before kickoff: editable, not locked", () => {
    const result = getTablePredictionEditability({
      joinedAt: new Date("2026-08-01T00:00:00.000Z"),
      now: new Date("2026-08-10T00:00:00.000Z"),
      gameweekOneKickoff: GW1_KICKOFF,
    });
    expect(result).toEqual({
      editable: true,
      locked: false,
      isLateJoiner: false,
    });
  });

  it("on-time player, at/after kickoff: locked, not editable", () => {
    const result = getTablePredictionEditability({
      joinedAt: new Date("2026-08-01T00:00:00.000Z"),
      now: GW1_KICKOFF,
      gameweekOneKickoff: GW1_KICKOFF,
    });
    expect(result).toEqual({
      editable: false,
      locked: true,
      isLateJoiner: false,
    });
  });

  it("late joiner, well after kickoff: always editable, never locked", () => {
    const result = getTablePredictionEditability({
      joinedAt: new Date("2026-09-01T00:00:00.000Z"),
      now: new Date("2027-01-01T00:00:00.000Z"),
      gameweekOneKickoff: GW1_KICKOFF,
    });
    expect(result).toEqual({
      editable: true,
      locked: false,
      isLateJoiner: true,
    });
  });

  it("no gameweek-1 kickoff known yet: nobody is locked", () => {
    const result = getTablePredictionEditability({
      joinedAt: new Date("2026-08-01T00:00:00.000Z"),
      now: new Date("2026-08-10T00:00:00.000Z"),
      gameweekOneKickoff: null,
    });
    expect(result).toEqual({
      editable: true,
      locked: false,
      isLateJoiner: false,
    });
  });
});
