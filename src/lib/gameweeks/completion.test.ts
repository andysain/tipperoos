import { describe, expect, it } from "vitest";
import {
  isGameweekScoringComplete,
  isSlotScoringDone,
  type ScoringSlot,
} from "./completion";

// Golden values hand-derived per issue #166 D3 (corrected during
// implementation against real evidence -- see the module doc comment): a
// slot is scoring-done when its match id is null (Skipped Slot), when it's
// completed, or when it's voided -- and "voided" reuses the same combined
// signal isMatchVoided() already establishes (voided_at OR
// status === "postponed"), not voided_at alone.

function slot(overrides: Partial<ScoringSlot> = {}): ScoringSlot {
  return { matchId: "match-1", status: "scheduled", voidedAt: null, ...overrides };
}

describe("isSlotScoringDone", () => {
  it("is done for a Skipped Slot (null match id), regardless of status", () => {
    expect(isSlotScoringDone(slot({ matchId: null, status: null }))).toBe(
      true,
    );
  });

  it("is done once the match has a completed result", () => {
    expect(isSlotScoringDone(slot({ status: "completed" }))).toBe(true);
  });

  it("is not done while the match is merely scheduled with no voided signal", () => {
    expect(isSlotScoringDone(slot({ status: "scheduled" }))).toBe(false);
  });

  it("is done when the slot's own voided_at is set, regardless of status", () => {
    expect(
      isSlotScoringDone(
        slot({ status: "scheduled", voidedAt: "2026-08-15T00:00:00Z" }),
      ),
    ).toBe(true);
  });

  it("is done when the match's status is postponed, even with no voided_at set", () => {
    expect(
      isSlotScoringDone(slot({ status: "postponed", voidedAt: null })),
    ).toBe(true);
  });
});

describe("isGameweekScoringComplete", () => {
  it("is complete when both slots are completed", () => {
    expect(
      isGameweekScoringComplete(
        slot({ matchId: "m1", status: "completed" }),
        slot({ matchId: "m2", status: "completed" }),
      ),
    ).toBe(true);
  });

  it("is not complete when only one slot is done", () => {
    expect(
      isGameweekScoringComplete(
        slot({ matchId: "m1", status: "completed" }),
        slot({ matchId: "m2", status: "scheduled" }),
      ),
    ).toBe(false);
  });

  it("is complete when a Skipped Slot pairs with a completed match", () => {
    expect(
      isGameweekScoringComplete(
        slot({ matchId: null, status: null }),
        slot({ matchId: "m2", status: "completed" }),
      ),
    ).toBe(true);
  });

  it("is complete when a voided match pairs with a completed match", () => {
    expect(
      isGameweekScoringComplete(
        slot({ matchId: "m1", status: "postponed" }),
        slot({ matchId: "m2", status: "completed" }),
      ),
    ).toBe(true);
  });
});

// Numeric golden values: how many of a mixed set of slots are scoring-done,
// under each of the four "done" reasons (Skipped, completed, voided_at,
// postponed-defensive) plus the one "not done" case. This is the same
// per-slot predicate a sync cycle would use to count how many gameweeks are
// still pending scoring, so it's asserted as a count, not just a boolean.
describe("isSlotScoringDone across a mixed set", () => {
  const mixed: ScoringSlot[] = [
    slot({ matchId: null, status: null }), // Skipped -- done
    slot({ status: "completed" }), // done
    slot({ status: "scheduled" }), // not done
    slot({ voidedAt: "2026-08-15T00:00:00Z" }), // voided_at -- done
    slot({ status: "postponed" }), // postponed-defensive -- done
  ];

  it("counts exactly 4 of 5 mixed slots as scoring-done", () => {
    expect(mixed.filter(isSlotScoringDone).length).toBe(4);
  });

  it("counts exactly 1 of 5 mixed slots as still pending", () => {
    expect(mixed.filter((s) => !isSlotScoringDone(s)).length).toBe(1);
  });

  it("counts 0 pending when every slot is a Skipped Slot", () => {
    const allSkipped: ScoringSlot[] = [
      slot({ matchId: null, status: null }),
      slot({ matchId: null, status: null }),
    ];
    expect(allSkipped.filter((s) => !isSlotScoringDone(s)).length).toBe(0);
  });

  it("counts 2 pending when every slot is merely scheduled", () => {
    const allScheduled: ScoringSlot[] = [
      slot({ status: "scheduled" }),
      slot({ status: "scheduled" }),
    ];
    expect(allScheduled.filter((s) => !isSlotScoringDone(s)).length).toBe(2);
  });

  it("counts 0 gameweeks scoring-complete out of 2 when one slot each is still pending", () => {
    const gameweeks: [ScoringSlot, ScoringSlot][] = [
      [slot({ status: "completed" }), slot({ status: "scheduled" })],
      [slot({ status: "scheduled" }), slot({ status: "completed" })],
    ];
    const completeCount = gameweeks.filter(([m1, m2]) =>
      isGameweekScoringComplete(m1, m2),
    ).length;
    expect(completeCount).toBe(0);
  });

  it("counts 2 gameweeks scoring-complete out of 2 once every slot resolves", () => {
    const gameweeks: [ScoringSlot, ScoringSlot][] = [
      [slot({ status: "completed" }), slot({ matchId: null, status: null })],
      [slot({ status: "postponed" }), slot({ status: "completed" })],
    ];
    const completeCount = gameweeks.filter(([m1, m2]) =>
      isGameweekScoringComplete(m1, m2),
    ).length;
    expect(completeCount).toBe(2);
  });
});
