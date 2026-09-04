import { describe, expect, it } from "vitest";
import { deriveTablePredictionStripState } from "./strip-state";
import type { TablePredictionEditability } from "./rules";

const CHAMPION = { id: "arsenal", name: "Arsenal", shortCode: "ARS" };

const editable: TablePredictionEditability = {
  editable: true,
  locked: false,
  isLateJoiner: false,
};
const locked: TablePredictionEditability = {
  editable: false,
  locked: true,
  isLateJoiner: false,
};
const lateJoinerEditable: TablePredictionEditability = {
  editable: true,
  locked: false,
  isLateJoiner: true,
};

describe("deriveTablePredictionStripState", () => {
  it("shows the CTA when the player has never touched the flow and is still editable", () => {
    const result = deriveTablePredictionStripState({
      prediction: null,
      editability: editable,
      championTeam: null,
      bandCountsOk: false,
      leaguePosition: null,
      score: null,
      rank: null,
    });
    expect(result).toEqual({ kind: "not_submitted" });
  });

  it("hides once the deadline has passed and the player never submitted", () => {
    const result = deriveTablePredictionStripState({
      prediction: null,
      editability: locked,
      championTeam: null,
      bandCountsOk: false,
      leaguePosition: null,
      score: null,
      rank: null,
    });
    expect(result).toEqual({ kind: "hidden" });
  });

  it("hides for a skipped prediction regardless of editability", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: null, skipped: true },
      editability: editable,
      championTeam: null,
      bandCountsOk: false,
      leaguePosition: null,
      score: null,
      rank: null,
    });
    expect(result).toEqual({ kind: "hidden" });
  });

  it("shows the CTA for an editable, submitted=null, skipped=false record", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: null, skipped: false },
      editability: editable,
      championTeam: null,
      bandCountsOk: false,
      leaguePosition: null,
      score: null,
      rank: null,
    });
    expect(result).toEqual({ kind: "not_submitted" });
  });

  it("hides a submitted record whose Champion Band holds zero teams", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: "2026-08-01T00:00:00Z", skipped: false },
      editability: editable,
      championTeam: null,
      bandCountsOk: true,
      leaguePosition: 3,
      score: null,
      rank: null,
    });
    expect(result).toEqual({ kind: "hidden" });
  });

  it("hides a submitted record whose Champion Band holds two teams", () => {
    // championTeam is null here too -- the loader only ever resolves a
    // single champion row; two rows in the Champion Band is exactly the
    // "not exactly one team" case the loader collapses to null.
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: "2026-08-01T00:00:00Z", skipped: false },
      editability: locked,
      championTeam: null,
      bandCountsOk: false,
      leaguePosition: null,
      score: null,
      rank: null,
    });
    expect(result).toEqual({ kind: "hidden" });
  });

  it("shows Champion + edit affordance, no warning, when submitted, editable and tidy", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: "2026-08-01T00:00:00Z", skipped: false },
      editability: editable,
      championTeam: CHAMPION,
      bandCountsOk: true,
      leaguePosition: 1,
      score: 132,
      rank: 3,
    });
    expect(result).toEqual({
      kind: "submitted_editable",
      champion: CHAMPION,
      bandsUntidy: false,
      leaguePosition: 1,
      score: 132,
      rank: 3,
    });
  });

  it("shows the untidy warning when submitted, editable and Bands are mismatched", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: "2026-08-01T00:00:00Z", skipped: false },
      editability: editable,
      championTeam: CHAMPION,
      bandCountsOk: false,
      leaguePosition: 1,
      score: 90,
      rank: 7,
    });
    expect(result).toEqual({
      kind: "submitted_editable",
      champion: CHAMPION,
      bandsUntidy: true,
      leaguePosition: 1,
      score: 90,
      rank: 7,
    });
  });

  it("passes through a null score and null rank when no cohort recompute has run yet", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: "2026-08-01T00:00:00Z", skipped: false },
      editability: editable,
      championTeam: CHAMPION,
      bandCountsOk: true,
      leaguePosition: 1,
      score: null,
      rank: null,
    });
    expect(result).toEqual({
      kind: "submitted_editable",
      champion: CHAMPION,
      bandsUntidy: false,
      leaguePosition: 1,
      score: null,
      rank: null,
    });
  });

  it("degrades to a null league position in the editable state too (day one -- no standings yet)", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: "2026-08-01T00:00:00Z", skipped: false },
      editability: editable,
      championTeam: CHAMPION,
      bandCountsOk: true,
      leaguePosition: null,
      score: null,
      rank: null,
    });
    expect(result).toEqual({
      kind: "submitted_editable",
      champion: CHAMPION,
      bandsUntidy: false,
      leaguePosition: null,
      score: null,
      rank: null,
    });
  });

  it("shows Champion + league position + rank, no edit affordance, once locked", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: "2026-08-01T00:00:00Z", skipped: false },
      editability: locked,
      championTeam: CHAMPION,
      bandCountsOk: true,
      leaguePosition: 4,
      score: 150,
      rank: 1,
    });
    expect(result).toEqual({
      kind: "submitted_locked",
      champion: CHAMPION,
      leaguePosition: 4,
      score: 150,
      rank: 1,
    });
    if (result.kind !== "submitted_locked") throw new Error("expected locked");
    expect(result.leaguePosition).toBe(4);
  });

  it("passes a null rank through the locked state for a Late Joiner (unranked by design)", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: "2026-09-15T00:00:00Z", skipped: false },
      editability: lateJoinerEditable,
      championTeam: CHAMPION,
      bandCountsOk: true,
      leaguePosition: 7,
      score: 40,
      rank: null,
    });
    expect(result).toEqual({
      kind: "submitted_editable",
      champion: CHAMPION,
      bandsUntidy: false,
      leaguePosition: 7,
      score: 40,
      rank: null,
    });
  });

  describe("leaguePosition passthrough for a locked, submitted Champion", () => {
    function locked(leaguePosition: number | null) {
      return deriveTablePredictionStripState({
        prediction: { submittedAt: "2026-08-01T00:00:00Z", skipped: false },
        editability: {
          editable: false,
          locked: true,
          isLateJoiner: false,
        },
        championTeam: CHAMPION,
        bandCountsOk: true,
        leaguePosition,
        score: 100,
        rank: 5,
      });
    }

    it("keeps 1st exactly", () => {
      const result = locked(1);
      if (result.kind !== "submitted_locked")
        throw new Error("expected locked");
      expect(result.leaguePosition).toBe(1);
    });

    it("keeps 2nd exactly", () => {
      const result = locked(2);
      if (result.kind !== "submitted_locked")
        throw new Error("expected locked");
      expect(result.leaguePosition).toBe(2);
    });

    it("keeps 11th exactly", () => {
      const result = locked(11);
      if (result.kind !== "submitted_locked")
        throw new Error("expected locked");
      expect(result.leaguePosition).toBe(11);
    });

    it("keeps 17th exactly", () => {
      const result = locked(17);
      if (result.kind !== "submitted_locked")
        throw new Error("expected locked");
      expect(result.leaguePosition).toBe(17);
    });

    it("keeps 20th exactly (bottom of the table)", () => {
      const result = locked(20);
      if (result.kind !== "submitted_locked")
        throw new Error("expected locked");
      expect(result.leaguePosition).toBe(20);
    });
  });

  it("degrades to a null league position when no team_standings row exists yet", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: "2026-08-01T00:00:00Z", skipped: false },
      editability: locked,
      championTeam: CHAMPION,
      bandCountsOk: true,
      leaguePosition: null,
      score: 100,
      rank: 2,
    });
    expect(result).toEqual({
      kind: "submitted_locked",
      champion: CHAMPION,
      leaguePosition: null,
      score: 100,
      rank: 2,
    });
  });

  it("shows the Champion for a Late Joiner who has submitted, despite locked: false being permanent for them", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: "2026-09-15T00:00:00Z", skipped: false },
      editability: lateJoinerEditable,
      championTeam: CHAMPION,
      bandCountsOk: true,
      leaguePosition: 7,
      score: null,
      rank: null,
    });
    expect(result).toEqual({
      kind: "submitted_editable",
      champion: CHAMPION,
      bandsUntidy: false,
      leaguePosition: 7,
      score: null,
      rank: null,
    });
  });

  it("keeps offering the CTA to a Late Joiner who hasn't submitted or skipped, with no deadline to expire it", () => {
    const result = deriveTablePredictionStripState({
      prediction: { submittedAt: null, skipped: false },
      editability: lateJoinerEditable,
      championTeam: null,
      bandCountsOk: false,
      leaguePosition: null,
      score: null,
      rank: null,
    });
    expect(result).toEqual({ kind: "not_submitted" });
  });
});
