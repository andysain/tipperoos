import { describe, expect, it } from "vitest";
import { tippedSlots, type GameweekSlotRow } from "./tipped-slots";

// Golden values hand-derived from CONTEXT.md -- a Skipped Slot (postponed
// BEFORE lock, no match at all) and a Voided Match (postponed AFTER lock,
// still tipped, never scored) are different facts, and this is the one place
// the distinction is decoded from the row shape.

const row = (over: Partial<GameweekSlotRow> = {}): GameweekSlotRow => ({
  number: 24,
  match_1_id: "m1",
  match_2_id: "m2",
  match_1_voided_at: null,
  match_2_voided_at: null,
  ...over,
});

describe("tippedSlots", () => {
  it("flattens a normal gameweek to two slots", () => {
    const slots = tippedSlots([row()]);
    expect(slots.length).toBe(2);
    expect(slots[0].gameweek).toBe(24);
    expect(slots[1].gameweek).toBe(24);
  });

  it("carries each slot's sourced provenance", () => {
    const slots = tippedSlots([row()]);
    expect(slots[0].provenance).toBe("top_matchup");
    expect(slots[1].provenance).toBe("random_pick");
  });

  // Skipped Slot: no match exists, so nothing is emitted for it.
  it("emits one slot when a fixture was postponed before lock", () => {
    expect(tippedSlots([row({ match_2_id: null })]).length).toBe(1);
  });

  // Voided Match: the match IS still tipped, so it is emitted and flagged.
  it("keeps a voided match and marks it called off", () => {
    const slots = tippedSlots([
      row({ match_2_voided_at: "2026-02-14T13:00:00Z" }),
    ]);
    expect(slots.length).toBe(2);
    expect(slots[1].calledOff).toBe(true);
    expect(slots[0].calledOff).toBe(false);
  });

  it("flattens several gameweeks in order", () => {
    const slots = tippedSlots([
      row({ number: 1, match_1_id: "a", match_2_id: "b" }),
      row({ number: 2, match_1_id: "c", match_2_id: "d" }),
    ]);
    expect(slots.length).toBe(4);
    expect(slots[0].gameweek).toBe(1);
    expect(slots[3].gameweek).toBe(2);
  });

  it("emits nothing for a gameweek with both slots skipped", () => {
    expect(
      tippedSlots([row({ match_1_id: null, match_2_id: null })]).length,
    ).toBe(0);
  });
});
