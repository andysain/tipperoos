import { describe, expect, it } from "vitest";
import {
  LOCKOUT_DURATION_MINUTES,
  MAX_FAILED_PIN_ATTEMPTS,
  isLocked,
  recordFailedPinAttempt,
  recordSuccessfulLogin,
} from "./lockout";

// Golden values hand-derived from CLAUDE.md -> Identity and auth:
// "5 failed PIN attempts locks the account for 15 minutes (auto-expires...).
// A successful login resets the failed-attempt counter."
const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("constants", () => {
  it("locks after 5 failed attempts", () => {
    expect(MAX_FAILED_PIN_ATTEMPTS).toBe(5);
  });

  it("locks for 15 minutes", () => {
    expect(LOCKOUT_DURATION_MINUTES).toBe(15);
  });
});

describe("recordFailedPinAttempt", () => {
  it("increments the counter without locking for attempts 1-4", () => {
    let state = { failedPinAttempts: 0, lockedUntil: null as string | null };
    for (const expected of [1, 2, 3, 4]) {
      state = recordFailedPinAttempt(state, NOW);
      expect(state.failedPinAttempts).toBe(expected);
      expect(state.lockedUntil).toBe(null);
    }
  });

  it("locks on the 5th failed attempt, for exactly 15 minutes from now", () => {
    let state = { failedPinAttempts: 4, lockedUntil: null as string | null };
    state = recordFailedPinAttempt(state, NOW);
    expect(state.failedPinAttempts).toBe(5);
    expect(state.lockedUntil).not.toBe(null);
    const lockedUntilMs = new Date(state.lockedUntil as string).getTime();
    expect(lockedUntilMs - NOW.getTime()).toBe(15 * 60 * 1000);
    expect(lockedUntilMs - NOW.getTime()).toBe(900000);
  });

  it("keeps re-extending the lock window on further failed attempts past the threshold", () => {
    const state = recordFailedPinAttempt(
      { failedPinAttempts: 6, lockedUntil: NOW.toISOString() },
      NOW,
    );
    expect(state.failedPinAttempts).toBe(7);
    const lockedUntilMs = new Date(state.lockedUntil as string).getTime();
    expect(lockedUntilMs - NOW.getTime()).toBe(900000);
  });
});

describe("isLocked", () => {
  it("is false with no lockedUntil set", () => {
    expect(isLocked({ failedPinAttempts: 2, lockedUntil: null }, NOW)).toBe(
      false,
    );
  });

  it("is true while now is before lockedUntil", () => {
    const lockedUntil = new Date(NOW.getTime() + 900000).toISOString();
    const almostThere = new Date(NOW.getTime() + 899999);
    expect(isLocked({ failedPinAttempts: 5, lockedUntil }, almostThere)).toBe(
      true,
    );
  });

  it("is false once now reaches lockedUntil (auto-expiry)", () => {
    const lockedUntil = new Date(NOW.getTime() + 900000).toISOString();
    const exactlyThere = new Date(NOW.getTime() + 900000);
    expect(isLocked({ failedPinAttempts: 5, lockedUntil }, exactlyThere)).toBe(
      false,
    );
  });
});

describe("recordSuccessfulLogin", () => {
  it("resets the failed-attempt counter and clears any lock", () => {
    const state = recordSuccessfulLogin({
      failedPinAttempts: 5,
      lockedUntil: NOW.toISOString(),
    });
    expect(state.failedPinAttempts).toBe(0);
    expect(state.lockedUntil).toBe(null);
  });
});
