import { describe, expect, it } from "vitest";
import { orderBoardSlots } from "./order-slots";

// Golden values hand-derived from the display rule ("shown in kickoff order",
// CLAUDE.md): matches first by kickoff, the marquee (Top Matchup) breaking a
// kickoff tie, and any Skipped Slot last. Orders are pinned by numeric
// position (literal-value discipline, TESTING_STANDARD.md). This module never
// touches the database.

interface TestSlot {
  kind: "match" | "skipped";
  id: string;
  kickoffUtcIso?: string;
  provenance?: "top_matchup" | "random_pick";
}

function match(
  id: string,
  kickoffUtcIso: string,
  provenance: NonNullable<TestSlot["provenance"]>,
): TestSlot {
  return { kind: "match", id, kickoffUtcIso, provenance };
}

const skipped = (id: string): TestSlot => ({ kind: "skipped", id });

const kickoffOf = (s: TestSlot) =>
  s.kind === "match" ? (s.kickoffUtcIso ?? null) : null;
const topMatchupOf = (s: TestSlot) =>
  s.kind === "match" && s.provenance === "top_matchup";

// The 0-based position of an id in the sorted output (-1 if absent).
function position(items: TestSlot[], id: string): number {
  return orderBoardSlots(items, kickoffOf, topMatchupOf).findIndex(
    (s) => s.id === id,
  );
}

describe("orderBoardSlots", () => {
  it("puts the earlier kickoff on top, regardless of sourced slot order", () => {
    const marquee = match("marquee", "2026-08-16T17:00:00Z", "top_matchup");
    const random = match("random", "2026-08-16T12:30:00Z", "random_pick");
    expect(position([marquee, random], "random")).toBe(0);
    expect(position([marquee, random], "marquee")).toBe(1);
    expect(position([random, marquee], "random")).toBe(0);
    expect(position([random, marquee], "marquee")).toBe(1);
  });

  it("keeps the marquee (Top Matchup) on top when kickoffs tie", () => {
    const marquee = match("marquee", "2026-08-16T14:00:00Z", "top_matchup");
    const random = match("random", "2026-08-16T14:00:00Z", "random_pick");
    expect(position([marquee, random], "marquee")).toBe(0);
    expect(position([marquee, random], "random")).toBe(1);
    expect(position([random, marquee], "marquee")).toBe(0);
    expect(position([random, marquee], "random")).toBe(1);
  });

  it("keeps the marquee on top when it kicks off earlier", () => {
    const marquee = match("marquee", "2026-08-16T14:00:00Z", "top_matchup");
    const random = match("random", "2026-08-16T17:30:00Z", "random_pick");
    expect(position([marquee, random], "marquee")).toBe(0);
    expect(position([marquee, random], "random")).toBe(1);
  });

  it("sorts a Skipped Slot last, after the remaining match", () => {
    const present = match("a", "2026-08-16T15:00:00Z", "top_matchup");
    expect(position([skipped("s1"), present, skipped("s2")], "a")).toBe(0);
    expect(position([skipped("s1"), present, skipped("s2")], "s1")).toBe(1);
    expect(position([skipped("s1"), present, skipped("s2")], "s2")).toBe(2);
  });

  it("keeps only-skipped input in place", () => {
    expect(position([skipped("s1"), skipped("s2")], "s1")).toBe(0);
    expect(position([skipped("s1"), skipped("s2")], "s2")).toBe(1);
  });

  it("does not mutate the input array", () => {
    const input = [
      match("marquee", "2026-08-16T17:00:00Z", "top_matchup"),
      match("random", "2026-08-16T12:30:00Z", "random_pick"),
    ];
    orderBoardSlots(input, kickoffOf, topMatchupOf);
    expect(position(input, "random")).toBe(0);
    expect(position(input, "marquee")).toBe(1);
  });
});
