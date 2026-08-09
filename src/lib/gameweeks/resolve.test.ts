import { describe, expect, it } from "vitest";
import {
  resolveCurrentGameweek,
  type CandidateGameweek,
  type GameweekSlot,
} from "./resolve";

// Golden values hand-derived per docs/adr/0007-home-surface-and-pick-entry.md's
// rule ("lowest-numbered Gameweek ... with any Tipped Match not yet locked;
// failing that, the highest-numbered Gameweek that has Tipped Matches") and
// the Skipped Slot / Voided Match schema comments in
// supabase/migrations/20260801045416_schema_v1.sql. See issue #86's decision
// log for how each scenario was chosen.

const NOW = new Date("2026-09-01T12:00:00Z");
// Well outside the 5-minute lock window (src/lib/competitions/scope.ts).
const OPEN_KICKOFF = new Date("2026-09-01T13:00:00Z");
// Already kicked off -- locked under any lock-window size.
const LOCKED_KICKOFF = new Date("2026-09-01T11:00:00Z");

function openSlot(matchId = "m"): GameweekSlot {
  return { matchId, kickoffTime: OPEN_KICKOFF, voidedAt: null };
}

function lockedSlot(matchId = "m"): GameweekSlot {
  return { matchId, kickoffTime: LOCKED_KICKOFF, voidedAt: null };
}

function voidedSlot(matchId = "m"): GameweekSlot {
  return {
    matchId,
    kickoffTime: LOCKED_KICKOFF,
    voidedAt: new Date("2026-08-30T00:00:00Z"),
  };
}

function skippedSlot(): GameweekSlot {
  return { matchId: null, kickoffTime: null, voidedAt: null };
}

function gameweek(
  number: number,
  match1: GameweekSlot,
  match2: GameweekSlot,
): CandidateGameweek {
  return { number, match1, match2 };
}

describe("resolveCurrentGameweek", () => {
  it("returns null when no gameweeks exist yet", () => {
    expect(resolveCurrentGameweek([], NOW)).toBe(null);
  });

  it("returns the single gameweek's number when its only slot is still open", () => {
    const result = resolveCurrentGameweek(
      [gameweek(1, openSlot(), skippedSlot())],
      NOW,
    );
    expect(result).toBe(1);
  });

  it("picks the lowest-numbered gameweek with a Tipped Match not yet locked, skipping an earlier fully-locked one", () => {
    const result = resolveCurrentGameweek(
      [
        gameweek(1, lockedSlot(), lockedSlot()),
        gameweek(2, openSlot(), lockedSlot()),
      ],
      NOW,
    );
    expect(result).toBe(2);
  });

  it("picks the lowest-numbered open gameweek even when a later gameweek is also open", () => {
    const result = resolveCurrentGameweek(
      [
        gameweek(3, openSlot(), lockedSlot()),
        gameweek(5, openSlot(), openSlot()),
      ],
      NOW,
    );
    expect(result).toBe(3);
  });

  it("treats a Skipped Slot (null matchId) as not open, moving past it to the next open gameweek", () => {
    const result = resolveCurrentGameweek(
      [
        gameweek(4, skippedSlot(), lockedSlot()),
        gameweek(5, openSlot(), skippedSlot()),
      ],
      NOW,
    );
    expect(result).toBe(5);
  });

  it("never treats a voided slot as open, even though it was genuinely tipped -- falls back to it once fully locked", () => {
    const result = resolveCurrentGameweek(
      [gameweek(6, voidedSlot(), lockedSlot())],
      NOW,
    );
    expect(result).toBe(6);
  });

  it("with several gameweeks all fully locked, falls back to the highest-numbered one rather than the first locked one seen", () => {
    const result = resolveCurrentGameweek(
      [
        gameweek(1, lockedSlot(), lockedSlot()),
        gameweek(2, lockedSlot(), voidedSlot()),
        gameweek(3, voidedSlot(), lockedSlot()),
      ],
      NOW,
    );
    expect(result).toBe(3);
  });

  it("falls back to the highest-numbered gameweek with any Tipped Match, skipping a later gameweek whose slots were both skipped before lock", () => {
    const result = resolveCurrentGameweek(
      [
        gameweek(7, lockedSlot(), voidedSlot()),
        gameweek(8, skippedSlot(), skippedSlot()),
      ],
      NOW,
    );
    expect(result).toBe(7);
  });

  it("returns null when every gameweek's slots are Skipped -- no Tipped Match ever existed to fall back to", () => {
    const result = resolveCurrentGameweek(
      [gameweek(1, skippedSlot(), skippedSlot())],
      NOW,
    );
    expect(result).toBe(null);
  });

  it("is invariant to input order: shuffled gameweek rows resolve the same as sorted ones", () => {
    const sorted: CandidateGameweek[] = [
      gameweek(1, lockedSlot(), lockedSlot()),
      gameweek(2, lockedSlot(), voidedSlot()),
      gameweek(3, openSlot(), lockedSlot()),
    ];
    const shuffled = [sorted[2], sorted[0], sorted[1]];

    expect(resolveCurrentGameweek(shuffled, NOW)).toBe(
      resolveCurrentGameweek(sorted, NOW),
    );
    expect(resolveCurrentGameweek(sorted, NOW)).toBe(3);
  });
});
