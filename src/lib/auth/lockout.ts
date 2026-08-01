export const MAX_FAILED_PIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

export interface LockoutState {
  failedPinAttempts: number;
  lockedUntil: string | null;
}

/** Records a failed PIN attempt, locking the account once the threshold is hit. */
export function recordFailedPinAttempt(
  state: LockoutState,
  now: Date,
): LockoutState {
  const failedPinAttempts = state.failedPinAttempts + 1;
  const lockedUntil =
    failedPinAttempts >= MAX_FAILED_PIN_ATTEMPTS
      ? new Date(
          now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000,
        ).toISOString()
      : state.lockedUntil;
  return { failedPinAttempts, lockedUntil };
}

/** Resets lockout state after a successful login. */
export function recordSuccessfulLogin(_state: LockoutState): LockoutState {
  return { failedPinAttempts: 0, lockedUntil: null };
}

/** Whether the account is currently locked out, given the current time. */
export function isLocked(state: LockoutState, now: Date): boolean {
  if (!state.lockedUntil) return false;
  return now.getTime() < new Date(state.lockedUntil).getTime();
}
