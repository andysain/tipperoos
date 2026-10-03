import { describe, expect, it } from "vitest";
import {
  isLockedAt,
  lockInstantIso,
  lockInstantMs,
  LOCK_WINDOW_MS,
} from "./lock-window";

const KICKOFF = "2026-10-03T14:00:00.000Z";
// 2026-10-03T14:00:00.000Z in epoch ms, and the lock instant 5 minutes
// (300,000ms) earlier -- hand-computed, not derived from the functions
// under test, per TESTING_STANDARD.md section 1a's golden-value discipline.
const KICKOFF_MS = 1791036000000;
const LOCK_MS = 1791035700000;

describe("lock window", () => {
  it("locks exactly five minutes before kickoff", () => {
    expect(LOCK_WINDOW_MS).toBe(300_000);
    expect(new Date(KICKOFF).getTime()).toBe(KICKOFF_MS);
    expect(lockInstantIso(KICKOFF)).toBe("2026-10-03T13:55:00.000Z");
    expect(lockInstantMs(KICKOFF)).toBe(LOCK_MS);
  });

  it("is open one millisecond before the lock instant", () => {
    expect(isLockedAt(KICKOFF, LOCK_MS - 1)).toBe(false);
  });

  it("is locked at the lock instant itself, matching the server", () => {
    expect(isLockedAt(KICKOFF, LOCK_MS)).toBe(true);
  });

  it("locks across a different kickoff instant too, not just the fixture above", () => {
    const otherKickoff = "2027-05-16T19:30:00.000Z";
    expect(lockInstantMs(otherKickoff)).toBe(1810495500000);
    expect(isLockedAt(otherKickoff, 1810495499999)).toBe(false);
    expect(isLockedAt(otherKickoff, 1810495500000)).toBe(true);
  });
});
