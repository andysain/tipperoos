import { describe, expect, it } from "vitest";
import { isMatchVoided } from "./driver";

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
});
