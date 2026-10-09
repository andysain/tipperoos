import { describe, expect, it } from "vitest";
import {
  scorePredictTableCohort,
  bandIndexForRank,
} from "@/lib/scoring/predict-table";
import { TABLE_PREDICTION_DEADLINE } from "./rules";
import {
  arePeerTablesVisible,
  buildTableComparison,
  distanceLabel,
  gapSentence,
  isSeasonOver,
  leads,
} from "./compare";

// Golden values for issue #214's comparison view-model, hand-derived from
// CLAUDE.md -> "Season-long feature: Predict the Table" (Placement 5/2/1/0
// by Band distance 0/1/2/3+; Band Bonus 10 per Band, 15 for Relegated; a
// Bold Call +3 for a correct placement no more than ~1 in 10 eligible
// players made, with one lone call always allowed below 10 players).
//
// The scenario, with t1..t20 finishing in that order:
//   You:  exact, except t1/t2 swapped (t1 said Runners Up, t2 said
//         Champion) -- each 1 Band out.
//         Placement 18 x 5 + 2 + 2 = 94. Exact Bands: Champions League,
//         Europe, Mid, Lower, Relegation Battle (5 x 10) + Relegated (15)
//         = 65.
//   Them: exact, except t1/t20 swapped (t1 said Relegated, t20 said
//         Champion) -- each 7 Bands out, 0 each.
//         Placement 18 x 5 = 90. Exact Bands: Runners Up, Champions
//         League, Europe, Mid, Lower, Relegation Battle = 6 x 10 = 60.
//   Bold Calls (2 eligible players, so a correct call only one of them
//   made is rare): you alone have t20 in Relegated; them alone have t2 in
//   Runners Up. +3 each.
//   Totals: you 94 + 65 + 3 = 162; them 90 + 60 + 3 = 153; gap 9.

const TEAMS = Array.from({ length: 20 }, (_, i) => `t${String(i + 1)}`);
const actualBand = (teamId: string) =>
  bandIndexForRank(TEAMS.indexOf(teamId) + 1);

function exactBands(): Map<string, number> {
  return new Map(TEAMS.map((t) => [t, actualBand(t)]));
}

const youBands = exactBands();
youBands.set("t1", 1);
youBands.set("t2", 0);

const themBands = exactBands();
themBands.set("t1", 7);
themBands.set("t20", 0);

const results = scorePredictTableCohort(
  [
    { key: "you", bands: youBands, boldCallEligible: true },
    { key: "them", bands: themBands, boldCallEligible: true },
  ],
  TEAMS,
);

const teams = new Map(
  TEAMS.map((id) => [
    id,
    { id, name: `Club ${id}`, shortCode: id.toUpperCase() },
  ]),
);

const comparison = buildTableComparison({
  actualOrder: TEAMS,
  teams,
  you: { bands: youBands, result: results.get("you")! },
  them: { bands: themBands, result: results.get("them")! },
});

const row = (teamId: string) =>
  comparison.sections.flatMap((s) => s.rows).find((r) => r.teamId === teamId)!;

describe("buildTableComparison -- header figures", () => {
  it("splits each player's total into its three parts", () => {
    expect(comparison.you.placement).toBe(94);
    expect(comparison.you.bandBonus).toBe(65);
    expect(comparison.you.boldCalls).toBe(3);
    expect(comparison.you.total).toBe(162);
    expect(comparison.them.placement).toBe(90);
    expect(comparison.them.bandBonus).toBe(60);
    expect(comparison.them.boldCalls).toBe(3);
    expect(comparison.them.total).toBe(153);
  });

  it("names each player's exactly-right Bands in table order", () => {
    expect(comparison.you.exactBands).toEqual([
      "Champions League",
      "Europe",
      "Mid Table",
      "Lower Table",
      "Relegation Battle",
      "Relegated",
    ]);
    expect(comparison.them.exactBands).toEqual([
      "Runners Up",
      "Champions League",
      "Europe",
      "Mid Table",
      "Lower Table",
      "Relegation Battle",
    ]);
  });
});

describe("buildTableComparison -- rows (issue D10: Placement + any Bold Call)", () => {
  it("a club one Band out scores 2, with no Bold Call", () => {
    expect(row("t1").you.band).toBe(1);
    expect(row("t1").you.points).toBe(2);
    expect(row("t1").you.boldCall).toBe(false);
  });

  it("a club seven Bands out scores 0", () => {
    expect(row("t1").them.band).toBe(7);
    expect(row("t1").them.points).toBe(0);
  });

  it("a rare correct call folds its Bold Call in: 5 + 3 = 8", () => {
    expect(row("t20").you.placement).toBe(5);
    expect(row("t20").you.points).toBe(8);
    expect(row("t20").you.boldCall).toBe(true);
    expect(row("t2").them.points).toBe(8);
  });

  it("a correct call both players made is not a Bold Call", () => {
    expect(row("t10").you.points).toBe(5);
    expect(row("t10").them.points).toBe(5);
  });

  it("orders rows by the real table, grouped into the Band they're in", () => {
    expect(comparison.sections).toHaveLength(8);
    expect(comparison.sections[0].rows.map((r) => r.teamId)).toEqual(["t1"]);
    expect(comparison.sections[2].rows.map((r) => r.position)).toEqual([
      3, 4, 5,
    ]);
    expect(comparison.sections[7].rows.map((r) => r.teamId)).toEqual([
      "t18",
      "t19",
      "t20",
    ]);
  });
});

describe("buildTableComparison -- exact-Band bonus per section (issue D12)", () => {
  it("puts each Band Bonus on its own section, per player", () => {
    expect(comparison.sections[0].youBandBonus).toBe(0);
    expect(comparison.sections[0].themBandBonus).toBe(0);
    expect(comparison.sections[1].youBandBonus).toBe(0);
    expect(comparison.sections[1].themBandBonus).toBe(10);
    expect(comparison.sections[7].youBandBonus).toBe(15);
    expect(comparison.sections[7].themBandBonus).toBe(0);
  });
});

describe("buildTableComparison -- invariants", () => {
  it("rows sum to Placement + Bold Calls, and adding the section bonuses gives the total", () => {
    for (const side of ["you", "them"] as const) {
      const rows = comparison.sections.flatMap((s) => s.rows);
      const rowSum = rows.reduce((sum, r) => sum + r[side].points, 0);
      const bonusSum = comparison.sections.reduce(
        (sum, s) => sum + (side === "you" ? s.youBandBonus : s.themBandBonus),
        0,
      );
      expect(rowSum).toBe(
        comparison[side].placement + comparison[side].boldCalls,
      );
      expect(rowSum + bonusSum).toBe(comparison[side].total);
    }
  });

  it("an unplaced club has no band and scores 0", () => {
    const partial = exactBands();
    partial.delete("t5");
    const scored = scorePredictTableCohort(
      [{ key: "p", bands: partial, boldCallEligible: false }],
      TEAMS,
    ).get("p")!;
    const view = buildTableComparison({
      actualOrder: TEAMS,
      teams,
      you: { bands: partial, result: scored },
      them: { bands: partial, result: scored },
    });
    const t5 = view.sections
      .flatMap((s) => s.rows)
      .find((r) => r.teamId === "t5")!;
    expect(t5.you.band).toBe(null);
    expect(t5.you.points).toBe(0);
    expect(distanceLabel(t5.you, t5.actualBand)).toBe("Not placed");
  });
});

describe("distanceLabel", () => {
  it("names the distance a call's points come from", () => {
    expect(distanceLabel(row("t10").you, row("t10").actualBand)).toBe(
      "Right Band",
    );
    expect(distanceLabel(row("t1").you, row("t1").actualBand)).toBe(
      "1 Band out",
    );
    expect(distanceLabel(row("t1").them, row("t1").actualBand)).toBe(
      "3+ Bands out",
    );
  });
});

describe("leads -- the higher figure, shown bold (issue D11)", () => {
  it("leads only when strictly ahead; level is no one's lead", () => {
    expect(leads(8, 2)).toBe(true);
    expect(leads(2, 8)).toBe(false);
    expect(leads(5, 5)).toBe(false);
    expect(leads(0, 0)).toBe(false);
  });
});

describe("gapSentence -- numbers only (prototype Q10)", () => {
  it("states the gap from the viewer's side", () => {
    expect(gapSentence("Sam", 162, 153)).toBe("You're 9 ahead of Sam.");
    expect(gapSentence("Sam", 153, 162)).toBe("Sam is 9 ahead.");
    expect(gapSentence("Sam", 47, 47)).toBe("You and Sam are level on 47.");
  });
});

describe("isSeasonOver -- issue D13", () => {
  it("is over only once every club has played all 38 of a 20-club season's matches", () => {
    expect(isSeasonOver(null)).toBe(false);
    expect(isSeasonOver(0)).toBe(false);
    expect(isSeasonOver(37)).toBe(false);
    expect(isSeasonOver(38)).toBe(true);
  });
});

describe("arePeerTablesVisible -- the peer-visibility rule", () => {
  it("hides every other table until the deadline, and shows them from it", () => {
    const deadline = TABLE_PREDICTION_DEADLINE.getTime();
    expect(arePeerTablesVisible(new Date(deadline - 1))).toBe(false);
    expect(arePeerTablesVisible(new Date(deadline))).toBe(true);
    expect(arePeerTablesVisible(new Date(deadline + 1))).toBe(true);
  });
});
