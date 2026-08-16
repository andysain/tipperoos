import { describe, expect, it } from "vitest";
import { isMatchVoided, type MatchSlotVoidSignal } from "./voided";

// Moved verbatim from scripts/scripted-gameweek-simulation/driver.test.ts
// (issue #166) when isMatchVoided was promoted to src/lib -- see voided.ts's
// doc comment for why.

describe("isMatchVoided", () => {
  it("is not voided when no slot signals it and the match is scheduled", () => {
    expect(isMatchVoided([{ voidedAt: null }], "scheduled")).toBe(false);
  });

  it("treats a postponed match as voided even with no voided_at set", () => {
    expect(isMatchVoided([{ voidedAt: null }], "postponed")).toBe(true);
  });

  it("treats a slot's voided_at as authoritative regardless of status", () => {
    expect(
      isMatchVoided([{ voidedAt: "2026-08-15T00:00:00Z" }], "completed"),
    ).toBe(true);
  });

  it("is not voided when no referencing slot exists and the match is complete", () => {
    expect(isMatchVoided([], "completed")).toBe(false);
  });

  it("is voided when any of several referencing slots is voided", () => {
    expect(
      isMatchVoided(
        [{ voidedAt: null }, { voidedAt: "2026-08-15T00:00:00Z" }],
        "scheduled",
      ),
    ).toBe(true);
  });

  // Numeric golden values: how many of a mixed set of (slots, status) cases
  // read as voided, across the two independent triggers (a slot's own
  // voided_at, and the postponed-status defensive fallback).
  it("counts exactly 3 of 5 mixed cases as voided", () => {
    const cases: [MatchSlotVoidSignal[], string][] = [
      [[{ voidedAt: null }], "scheduled"], // not voided
      [[{ voidedAt: null }], "postponed"], // voided (status)
      [[{ voidedAt: "2026-08-15T00:00:00Z" }], "completed"], // voided (slot)
      [[], "completed"], // not voided
      [[{ voidedAt: null }, { voidedAt: "2026-08-15T00:00:00Z" }], "scheduled"], // voided (slot)
    ];
    const voidedCount = cases.filter(([slots, status]) =>
      isMatchVoided(slots, status),
    ).length;
    expect(voidedCount).toBe(3);
  });

  it("counts 0 voided out of 2 when neither trigger fires", () => {
    const cases: [MatchSlotVoidSignal[], string][] = [
      [[{ voidedAt: null }], "scheduled"],
      [[], "completed"],
    ];
    expect(cases.filter(([s, st]) => isMatchVoided(s, st)).length).toBe(0);
  });

  it("counts 2 voided out of 2 when every case is postponed regardless of slot signal", () => {
    const cases: [MatchSlotVoidSignal[], string][] = [
      [[], "postponed"],
      [[{ voidedAt: null }], "postponed"],
    ];
    expect(cases.filter(([s, st]) => isMatchVoided(s, st)).length).toBe(2);
  });

  it("counts 1 voided out of 2 when only a slot's own voided_at fires, not status", () => {
    const cases: [MatchSlotVoidSignal[], string][] = [
      [[{ voidedAt: "2026-08-15T00:00:00Z" }], "scheduled"],
      [[{ voidedAt: null }], "scheduled"],
    ];
    expect(cases.filter(([s, st]) => isMatchVoided(s, st)).length).toBe(1);
  });

  it("counts all 3 referencing slots as voided when their shared match is postponed", () => {
    const slots: MatchSlotVoidSignal[] = [
      { voidedAt: null },
      { voidedAt: null },
      { voidedAt: null },
    ];
    // A single call covering every referencing slot for one match -- still
    // voided (status alone is enough), asserted against the slot count to
    // make the "regardless of how many slots reference it" claim concrete.
    expect(slots.length).toBe(3);
    expect(isMatchVoided(slots, "postponed") ? slots.length : 0).toBe(3);
  });
});
