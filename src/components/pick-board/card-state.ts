import type { TippedMatchCardState } from "./TippedMatchCard";

/**
 * The state the card should render *now*, on the player's own clock.
 *
 * The server decides `entry` / `filed` / `locked` once, at render time. A
 * tab left open across the lock instant used to keep showing live digit
 * rows that the server would then refuse. Once the lock instant passes on
 * the client, a pre-lock state flips to `locked`, carrying the pick if
 * there was one. Never the other way: a state the server already called
 * locked, live or finished is left alone.
 */
export function resolveCardStateAt(
  state: TippedMatchCardState,
  locked: boolean,
): TippedMatchCardState {
  if (!locked) return state;
  if (state.kind === "entry") {
    return { kind: "locked", ownHomeScore: null, ownAwayScore: null };
  }
  if (state.kind === "filed") {
    return {
      kind: "locked",
      ownHomeScore: state.ownHomeScore,
      ownAwayScore: state.ownAwayScore,
    };
  }
  return state;
}

/** True when a locked or live card has no pick behind it -- the "no pick,
 *  no points" moment, which must never read as "Locked in" or "Playing
 *  now". */
export function isLockedWithoutPick(state: TippedMatchCardState): boolean {
  return (
    (state.kind === "locked" || state.kind === "live") &&
    (state.ownHomeScore === null || state.ownAwayScore === null)
  );
}
