import { describe, expect, it } from "vitest";
import { TABLE_PREDICTION_DEADLINE } from "@/lib/table-predictions/rules";
import { fakeSupabase, type Row } from "../../../vitest/fake-supabase";
import {
  decideTableCompareAccess,
  loadTableComparison,
} from "./table-compare-access";

// /predict-table/[playerId]'s server-side gate (issue #214 D2/D4/D6 and
// done-when 2) -- the security boundary for the peer-visibility rule:
// hiding the leaderboard link is not enough, the route itself refuses.
// The deadline is derived from rules.ts, never restated.
//
// Two layers: the pure decision, and the same branches driven through the
// real loader (on the fake), so "another competition" and "skipped /
// un-submitted" are proven against the competition-scoped cohort read that
// actually enforces them, not against inputs the loader can't produce.

const AFTER = new Date(TABLE_PREDICTION_DEADLINE.getTime() + 1);
const BEFORE = new Date(TABLE_PREDICTION_DEADLINE.getTime() - 1);

describe("decideTableCompareAccess", () => {
  const base = {
    viewerId: "me",
    targetId: "sam",
    targetHasVisibleTable: true,
    now: AFTER,
  };

  it("redirects your own id to your own table, before any other check", () => {
    expect(
      decideTableCompareAccess({ ...base, targetId: "me", now: BEFORE }),
    ).toBe("own-table");
    expect(
      decideTableCompareAccess({
        ...base,
        targetId: "me",
        targetHasVisibleTable: false,
        now: null,
      }),
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

  it("refuses a target with no visible table", () => {
    expect(
      decideTableCompareAccess({ ...base, targetHasVisibleTable: false }),
    ).toBe("not-found");
  });

  it("fails closed when database time is unavailable", () => {
    expect(decideTableCompareAccess({ ...base, now: null })).toBe("not-found");
  });

  it("allows a visible table after the deadline", () => {
    expect(decideTableCompareAccess(base)).toBe("allow");
  });
});

// --- Through the real loader -------------------------------------------------

const TEAM_IDS = Array.from({ length: 20 }, (_, i) => `t${String(i + 1)}`);

function player(id: string, competitionId = "c1"): Row {
  return {
    id,
    competition_id: competitionId,
    display_name: id,
    emoji: null,
    joined_at: "2026-07-01T00:00:00Z",
    is_bot: false,
  };
}

function prediction(
  playerId: string,
  submitted: boolean,
  skipped = false,
): Row {
  return {
    id: `tp-${playerId}`,
    player_id: playerId,
    submitted_at: submitted ? "2026-08-20T00:00:00Z" : null,
    is_skipped: skipped,
  };
}

function seed(now: Date): Record<string, Row[]> {
  return {
    db_time: [{ now: now.toISOString() }],
    seasons: [{ id: "s1", is_current: true, start_date: "2026-08-01" }],
    matches: [{ season_id: "s1", kickoff_time: "2026-08-15T00:00:00Z" }],
    team_standings: TEAM_IDS.map((teamId, index) => ({
      team_id: teamId,
      season_id: "s1",
      position: index + 1,
      played: 8,
      updated_at: "2026-10-05T00:00:00Z",
    })),
    teams: TEAM_IDS.map((id) => ({
      id,
      name: id,
      short_code: id,
      active: true,
    })),
    players: [
      player("me"),
      player("sam"),
      player("skip"),
      player("draft"),
      player("other", "c2"),
    ],
    table_predictions: [
      prediction("me", true),
      prediction("sam", true),
      prediction("skip", false, true),
      prediction("draft", false),
      prediction("other", true),
    ],
    table_prediction_ranks: [],
  };
}

async function decisionFor(targetId: string, now = AFTER) {
  const { client } = fakeSupabase(seed(now));
  const { decision } = await loadTableComparison(
    client,
    { id: "me", competitionId: "c1" },
    targetId,
  );
  return decision;
}

describe("loadTableComparison -- the gate, end to end", () => {
  it("allows a submitted table in your competition after the deadline", async () => {
    expect(await decisionFor("sam")).toBe("allow");
  });

  it("refuses a peer before the deadline, on DB time", async () => {
    expect(await decisionFor("sam", BEFORE)).toBe("not-found");
  });

  it("refuses a player in another competition, even with a submitted table", async () => {
    expect(await decisionFor("other")).toBe("not-found");
  });

  it("refuses a skipped table and an un-submitted one", async () => {
    expect(await decisionFor("skip")).toBe("not-found");
    expect(await decisionFor("draft")).toBe("not-found");
  });

  it("refuses an id that matches nobody", async () => {
    expect(await decisionFor("nobody")).toBe("not-found");
  });

  it("sends your own id to your own table", async () => {
    expect(await decisionFor("me")).toBe("own-table");
  });
});
