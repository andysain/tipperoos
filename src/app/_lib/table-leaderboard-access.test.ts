import { describe, expect, it } from "vitest";
import { fakeSupabase, type Row } from "../../../vitest/fake-supabase";
import { loadTableLeaderboard } from "./table-leaderboard-access";

// Issue #214 D2: the Predict the Table board shows submitted tables only.
// `table_prediction_scores` rows are only ever upserted, while skipping --
// and every Band move a player made before the deadline -- sets the table's
// `submitted_at` back to null. So "has a score row" is not "has a submitted
// table": without the filter, a frozen score stays on the board forever.
//
// Asserted over the composed board (loadTableLeaderboard through
// buildTableLeaderboard), because the claim is about who is ranked where.

const COMPETITION_ID = "c1";
const BEFORE_GW1 = "2026-07-01T00:00:00Z";
const AFTER_GW1 = "2026-09-01T00:00:00Z";

function player(id: string, joinedAt: string): Row {
  return {
    id,
    competition_id: COMPETITION_ID,
    display_name: id,
    emoji: null,
    joined_at: joinedAt,
    is_bot: false,
  };
}

function score(playerId: string, total: number): Row {
  return {
    player_id: playerId,
    total_score: total,
    placement_score: total,
    band_bonus_score: 0,
    bold_call_score: 0,
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

function seed(): Record<string, Row[]> {
  return {
    seasons: [{ id: "s1", is_current: true }],
    matches: [{ season_id: "s1", kickoff_time: "2026-08-15T00:00:00Z" }],
    players: [
      player("ann", BEFORE_GW1),
      player("bob", BEFORE_GW1),
      // On time, scored, then moved a club and never re-submitted before
      // the deadline: a frozen score that would otherwise rank 1st.
      player("cat", BEFORE_GW1),
      // Late Joiner who submitted, was scored, then skipped.
      player("dan", AFTER_GW1),
      // Late Joiner with a submitted table: stays, unranked.
      player("eve", AFTER_GW1),
    ],
    table_prediction_scores: [
      score("ann", 120),
      score("bob", 110),
      score("cat", 150),
      score("dan", 140),
      score("eve", 130),
    ],
    table_predictions: [
      prediction("ann", true),
      prediction("bob", true),
      prediction("cat", false),
      prediction("dan", false, true),
      prediction("eve", true),
    ],
  };
}

describe("loadTableLeaderboard -- submitted tables only (issue #214 D2)", () => {
  it("drops a stale score whose table is un-submitted or skipped", async () => {
    const { client } = fakeSupabase(seed());
    const view = await loadTableLeaderboard(client, COMPETITION_ID, "ann");

    expect(view.rows.map((r) => r.playerId)).toEqual(["eve", "ann", "bob"]);
    expect(view.rows).toHaveLength(3);
  });

  it("re-ranks the players below a dropped stale score", async () => {
    const { client } = fakeSupabase(seed());
    const view = await loadTableLeaderboard(client, COMPETITION_ID, "ann");
    const rank = (id: string) => view.rows.find((r) => r.playerId === id)?.rank;

    // cat's frozen 150 would have been rank 1; with it gone ann leads.
    expect(rank("ann")).toBe(1);
    expect(rank("bob")).toBe(2);
    // eve tops the list on 130 but is a Late Joiner: shown, never ranked.
    expect(rank("eve")).toBe(null);
    expect(view.rows[0].totalScore).toBe(130);
  });

  it("is an empty, unscored board when no table is submitted", async () => {
    const data = seed();
    data.table_predictions = data.table_predictions.map((p) => ({
      ...p,
      submitted_at: null,
    }));
    const { client } = fakeSupabase(data);
    const view = await loadTableLeaderboard(client, COMPETITION_ID, "ann");

    expect(view.rows).toHaveLength(0);
    expect(view.scored).toBe(false);
  });
});
