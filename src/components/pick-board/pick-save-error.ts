import { formatKickoffInTimeZone } from "@/lib/dates/kickoff-format";

/**
 * What the card should do after a failed save, and what to tell the player.
 *
 * - `retry`: transient. Keep both selections, so tapping either score
 *   again re-files the same pick in one tap.
 * - `locked`: the server says picks closed. Clear the entry and refresh, so
 *   the card shows its real locked state.
 * - `stale`: the match isn't a tipped match any more (the gameweek moved
 *   on underneath an open tab). Refresh.
 * - `signed-out`: the session is gone. Nothing on this card can fix it.
 *
 * Every failure used to read "check your connection", including the
 * server's own "too late" answer, which blamed a player's wifi for a
 * deadline they had missed.
 */
export type PickSaveFailureKind = "retry" | "locked" | "stale" | "signed-out";

export interface PickSaveFailure {
  kind: PickSaveFailureKind;
  message: string;
}

export function describePickSaveFailure({
  status,
  code,
  kickoffUtcIso,
  lockUtcIso,
  timeZone,
}: {
  /** HTTP status, or null when the request never reached the server. */
  status: number | null;
  /** The route's machine-readable `code`, when it sent one. */
  code?: string | null;
  kickoffUtcIso: string;
  lockUtcIso: string;
  timeZone: string;
}): PickSaveFailure {
  if (status === null) {
    return {
      kind: "retry",
      message:
        "Couldn't reach Tipperoos. Check your connection, then tap a score to try again.",
    };
  }
  if (status === 403 && code === "locked") {
    return {
      kind: "locked",
      message: `Too late, picks for this one closed ${formatKickoffInTimeZone(
        lockUtcIso,
        timeZone,
      )}.`,
    };
  }
  if (status === 401) {
    return {
      kind: "signed-out",
      message:
        "You've been signed out. Sign back in from More, then pick again.",
    };
  }
  if (status === 400) {
    return {
      kind: "stale",
      message: `This match isn't open for picks any more (kickoff ${formatKickoffInTimeZone(
        kickoffUtcIso,
        timeZone,
      )}).`,
    };
  }
  return {
    kind: "retry",
    message: "That didn't save. Tap a score to try again.",
  };
}

/** Thrown by the save call so the card can act on `failure.kind`. */
export class PickSaveError extends Error {
  constructor(readonly failure: PickSaveFailure) {
    super(failure.message);
    this.name = "PickSaveError";
  }
}
