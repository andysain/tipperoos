import { describe, expect, it } from "vitest";
import { orderBoardSlots } from "./order-slots";

// Golden values hand-derived from the display rule ("shown in kickoff order",
// CLAUDE.md): matches first by kickoff, the marquee (Top Matchup) breaking
// a kickoff tie, and any Skipped Slot last. Uses a minimal structural shape --
// this module never touches the database.

interface TestSlot {
  kind: "match" | "skipped";
  id: string;
  kickoffUtcIso?: string;
  provenance?: "top_matchup" | "random_pick";
}

function match(
  id: string,
  kickoffUtcIso: string,
  provenance: TestSlot["provenance"],
): TestSlot {
  return { kind: "match", id, kickoffUtcIso, provenance };
}

const skipped = (id: string): TestSlot => ({ kind: "skipped", id });

const kickoffOf = (s: TestSlot) =>
  s.kind === "match" ? (s.kickoffUtcIso ?? null) : null;
const topMatchupOf = (s: TestSlot) =>
  s.kind === "match" && s.provenance === "top_matchup";

function order(items: TestSlot[]): string[] {
  return orderBoardSlots(items, kickoffOf, topMatchupOf).map((s) => s.id);
}

describe("orderBoardSlots", () => {
  it("puts the earlier kickoff on top, regardless of sourced slot order", () => {
    // sourced order is marquee-first in the DB, but the random pick kicks off
    // earlier here -- display must reflect kickoff, not source.
    const marquee = match("marquee", "2026-08-16T17:00:00Z", "top_matchup");
    const random = match("random", "2026-08-16T12:30:00Z", "random_pick");
    expect(order([marquee, random])).toEqual(["random", "marquee"]);
    expect(order([random, marquee])).toEqual(["random", "marquee"]);
  });

  it("keeps the marquee (Top Matchup) on top when kickoffs tie", () => {
    const marquee = match("marquee", "2026-08-16T14:00:00Z", "top_matchup");
    const random = match("random", "2026-08-16T14:00:00Z", "random_pick");
    expect(order([marquee, random])).toEqual(["marquee", "random"]);
    // also when the random pick is first in sourced order
    expect(order([random, marquee])).toEqual(["marquee", "random"]);
  });

  it("keeps the marquee on top when it kicks off earlier", () => {
    const marquee = match("marquee", "2026-08-16T14:00:00Z", "top_matchup");
    const random = match("random", "2026-08-16T17:30:00Z", "random_pick");
    expect(order([marquee, random])).toEqual(["marquee", "random"]);
  });

  it("sorts a Skipped Slot last, after the remaining match", () => {
    const matchA = match("a", "2026-08-16T15:00:00Z", "top_matchup");
    expect(order([skipped("s2"), matchA, skipped("s1")])).toEqual([
      "a",
      "s2",
      "s1",
    ]);
  });

  it("keeps only-skipped input in place", () => {
    expect(order([skipped("s1"), skipped("s2")])).toEqual(["s1", "s2"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      match("marquee", "2026-08-16T17:00:00Z", "top_matchup"),
      match("random", "2026-08-16T12:30:00Z", "random_pick"),
    ];
    const snapshot = [...input];
    order(input);
    expect(input).toEqual(snapshot);
  });
});
