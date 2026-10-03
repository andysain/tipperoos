import { describe, expect, it } from "vitest";
import {
  isLockedAt,
  lockInstantIso,
  lockInstantMs,
  LOCK_WINDOW_MS,
} from "./lock-window";

const KICKOFF = "2026-10-03T14:00:00.000Z";

describe("lock window", () => {
  it("locks exactly five minutes before kickoff", () => {
    expect(LOCK_WINDOW_MS).toBe(300_000);
    expect(lockInstantIso(KICKOFF)).toBe("2026-10-03T13:55:00.000Z");
    expect(lockInstantMs(KICKOFF)).toBe(
      new Date("2026-10-03T13:55:00.000Z").getTime(),
    );
  });

  it("is open one millisecond before the lock instant", () => {
    expect(isLockedAt(KICKOFF, lockInstantMs(KICKOFF) - 1)).toBe(false);
  });

  it("is locked at the lock instant itself, matching the server", () => {
    expect(isLockedAt(KICKOFF, lockInstantMs(KICKOFF))).toBe(true);
  });
});
