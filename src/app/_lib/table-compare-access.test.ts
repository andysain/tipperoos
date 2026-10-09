import { describe, expect, it } from "vitest";
import { TABLE_PREDICTION_DEADLINE } from "@/lib/table-predictions/rules";
import { decideTableCompareAccess } from "./table-compare-access";

// Branch test for /predict-table/[playerId]'s server-side gate (issue #214
// D2/D4/D6 and done-when 2). The deadline is derived from rules.ts, never
// restated. This is the security boundary for the peer-visibility rule:
// hiding the leaderboard link is not enough, the route itself refuses.

const AFTER = new Date(TABLE_PREDICTION_DEADLINE.getTime() + 1);
const BEFORE = new Date(TABLE_PREDICTION_DEADLINE.getTime() - 1);

const base = {
  viewerId: "me",
  viewerCompetitionId: "c1",
  targetId: "sam",
  target: { competitionId: "c1", hasSubmittedTable: true },
  now: AFTER,
};

describe("decideTableCompareAccess", () => {
  it("redirects your own id to your own table, before any other check", () => {
    expect(
      decideTableCompareAccess({ ...base, targetId: "me", now: BEFORE }),
    ).toBe("own-table");
    expect(
      decideTableCompareAccess({ ...base, targetId: "me", target: null }),
    ).toBe("own-table");
  });

  it("refuses a peer before the deadline", () => {
    expect(decideTableCompareAccess({ ...base, now: BEFORE })).toBe(
      "not-found",
    );
  });

  it('allows a peer at the deadline\'s exact instant -- "at or after" is locked, so tables show', () => {
    expect(
      decideTableCompareAccess({ ...base, now: TABLE_PREDICTION_DEADLINE }),
    ).toBe("allow");
  });

  it("refuses a player in another competition", () => {
    expect(
      decideTableCompareAccess({
        ...base,
        target: { competitionId: "c2", hasSubmittedTable: true },
      }),
    ).toBe("not-found");
  });

  it("refuses a player whose table is skipped or un-submitted", () => {
    expect(
      decideTableCompareAccess({
        ...base,
        target: { competitionId: "c1", hasSubmittedTable: false },
      }),
    ).toBe("not-found");
    expect(decideTableCompareAccess({ ...base, target: null })).toBe(
      "not-found",
    );
  });

  it("fails closed when database time is unavailable", () => {
    expect(decideTableCompareAccess({ ...base, now: null })).toBe("not-found");
  });

  it("allows a submitted table in your competition after the deadline", () => {
    expect(decideTableCompareAccess(base)).toBe("allow");
  });
});
