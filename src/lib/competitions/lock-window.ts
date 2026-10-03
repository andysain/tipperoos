// The lock window, importable from client code. scope.ts is `server-only`,
// so client components (the Pick Board's live countdown, its client-side
// lock flip) can't use its isMatchLocked. scope.ts keeps its own server
// copy; lock-window.test.ts pins the two to the same boundary.

/** Picks lock 5 minutes before kickoff (CLAUDE.md -> Predictions). */
export const LOCK_WINDOW_MS = 5 * 60 * 1000;

/** The instant a match's picks lock, in epoch milliseconds. */
export function lockInstantMs(kickoffUtcIso: string): number {
  return new Date(kickoffUtcIso).getTime() - LOCK_WINDOW_MS;
}

/** The instant a match's picks lock, as a UTC ISO string. */
export function lockInstantIso(kickoffUtcIso: string): string {
  return new Date(lockInstantMs(kickoffUtcIso)).toISOString();
}

/** True from the lock instant onward -- inclusive, matching the server. */
export function isLockedAt(kickoffUtcIso: string, nowMs: number): boolean {
  return nowMs >= lockInstantMs(kickoffUtcIso);
}
