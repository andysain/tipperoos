import { describe, expect, it } from "vitest";
import {
  isLockedAt,
  lockInstantIso,
  lockInstantMs,
  LOCK_WINDOW_MS,
} from "./lock-window";
import { isMatchLocked } from "./scope";

// Golden values hand-computed from CLAUDE.md -> Predictions ("Picks lock 5
// minutes before scheduled kickoff"), never derived from the functions under
// test (TESTING_STANDARD.md section 1a). Epoch values are UTC milliseconds.

describe("lock window", () => {
  it("is five minutes, in milliseconds", () => {
    expect(LOCK_WINDOW_MS).toBe(300000);
  });

  it("locks five minutes before a mid-afternoon kickoff", () => {
    // 2026-10-03T14:00:00Z = 1791036000000
    expect(lockInstantMs("2026-10-03T14:00:00.000Z")).toBe(1791035700000);
    expect(lockInstantIso("2026-10-03T14:00:00.000Z")).toBe(
      "2026-10-03T13:55:00.000Z",
    );
  });

  it("locks on the previous day for a midnight kickoff", () => {
    // 2026-12-31T00:00:00Z = 1798675200000
    expect(lockInstantMs("2026-12-31T00:00:00.000Z")).toBe(1798674900000);
    expect(lockInstantIso("2026-12-31T00:00:00.000Z")).toBe(
      "2026-12-30T23:55:00.000Z",
    );
  });

  it("locks five minutes before a kickoff in a later season", () => {
    // 2027-05-16T19:30:00Z = 1810495800000
    expect(lockInstantMs("2027-05-16T19:30:00.000Z")).toBe(1810495500000);
  });

  it("reads an offset kickoff as the same instant, whatever the timezone", () => {
    // 2026-10-04T01:00:00+11:00 (Sydney, AEDT) is 2026-10-03T14:00:00Z.
    expect(lockInstantMs("2026-10-04T01:00:00+11:00")).toBe(1791035700000);
  });

  it("is open one millisecond before the lock instant", () => {
    expect(isLockedAt("2026-10-03T14:00:00.000Z", 1791035699999)).toBe(false);
  });

  it("is locked at the lock instant itself, matching the server", () => {
    expect(isLockedAt("2026-10-03T14:00:00.000Z", 1791035700000)).toBe(true);
  });
});

// scope.ts keeps its own server-side copy of the lock rule (it is
// `server-only` and can't be imported by client components). This pins the
// two copies to the same boundary, so they can never drift apart silently.
describe("client lock window matches the server's isMatchLocked", () => {
  const kickoffIso = "2026-08-15T15:00:00.000Z";
  // 2026-08-15T15:00:00Z = 1786806000000; lock instant = 1786805700000

  it("locks the parity fixture at its hand-computed instant", () => {
    expect(lockInstantMs(kickoffIso)).toBe(1786805700000);
  });

  for (const nowMs of [1786805699999, 1786805700000, 1786806000000]) {
    it(`agrees at ${String(nowMs)}`, () => {
      expect(isLockedAt(kickoffIso, nowMs)).toBe(
        isMatchLocked(new Date(kickoffIso), new Date(nowMs)),
      );
    });
  }
});
