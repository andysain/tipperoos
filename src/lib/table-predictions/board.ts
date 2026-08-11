// Pure state-transition logic for the Band-fill capture board
// (docs/predict-table-capture-spec.md). Kept free of React so the tap
// rules for both phases -- the actual product behaviour -- can be unit
// tested directly, without rendering anything.

import { type BandKey } from "./rules";

export type Assignments = Record<string, BandKey>;
/** The Band each team most recently came from, one level deep -- what the
 * filling-phase toggle-revert and the undo affordance replay back to. */
export type PriorBandByTeam = Record<string, BandKey | null>;

export interface BoardState {
  assignments: Assignments;
  previous: PriorBandByTeam;
}

export interface TapResult {
  assignments: Assignments;
  previous: PriorBandByTeam;
  /** The Band the team moved out of, for the undo affordance -- null for a
   * fresh placement or a toggle-revert (spec: undo only names a Band the
   * team came *from*). */
  movedFrom: BandKey | null;
}

/**
 * Filling-phase tap (group-first): assign `teamId` to `openBand`, unless
 * it's already there, in which case it reverts to `previous[teamId]` (its
 * prior Band, or unplaced) -- standard multi-select toggle semantics, the
 * misclick escape.
 */
export function tapWhileFilling(
  state: BoardState,
  teamId: string,
  openBand: BandKey,
): TapResult {
  const current = state.assignments[teamId] ?? null;

  if (current === openBand) {
    const back = state.previous[teamId] ?? null;
    const assignments = { ...state.assignments };
    if (back) assignments[teamId] = back;
    else delete assignments[teamId];
    return { assignments, previous: state.previous, movedFrom: null };
  }

  const assignments = { ...state.assignments, [teamId]: openBand };
  const previous = { ...state.previous, [teamId]: current };
  return { assignments, previous, movedFrom: current };
}

/**
 * Review-phase move (team-first): drop the lifted `teamId` into `band`.
 * There is no toggle-revert here and no unplace -- an unplaced club scores
 * zero while a badly placed one still scores band distance.
 */
export function dropInto(
  state: BoardState,
  teamId: string,
  band: BandKey,
): TapResult {
  const current = state.assignments[teamId] ?? null;
  const assignments = { ...state.assignments, [teamId]: band };
  const previous = { ...state.previous, [teamId]: current };
  return { assignments, previous, movedFrom: current };
}

/** Start again: every club back to the roster. The only escape from a
 * table a player wants to bin, and the only operation that can't be
 * reconstructed from cheap individual moves. */
export function startAgain(): BoardState {
  return { assignments: {}, previous: {} };
}

export type FillTone = "under" | "ok" | "over";

export function fillTone(filled: number, target: number): FillTone {
  if (filled === target) return "ok";
  return filled > target ? "over" : "under";
}

/** The spec's exact "Count reads" text per fill state. */
export function countRead(filled: number, target: number): string {
  const tone = fillTone(filled, target);
  if (tone === "ok") return `✓ ${filled}/${target}`;
  if (tone === "over") {
    const over = filled - target;
    return `${filled}/${target} · ${over} over`;
  }
  const toGo = target - filled;
  return `${filled}/${target} · ${toGo} to go`;
}

export type Mode = "filling" | "review";

export function modeFor(placedCount: number, totalTeams: number): Mode {
  return placedCount === totalTeams ? "review" : "filling";
}

interface RosterTeam {
  id: string;
  previousSeasonPosition: number | null;
}

/**
 * Roster order: last season's finishing position, promoted clubs (no
 * previous position) last. Fixed for the life of the screen -- the list
 * never shrinks or re-sorts, so a club stays where the player learned it
 * was (docs/predict-table-capture-spec.md "The roster").
 */
export function rosterOrder<T extends RosterTeam>(teams: readonly T[]): T[] {
  return [...teams].sort(
    (a, b) =>
      (a.previousSeasonPosition ?? Number.MAX_SAFE_INTEGER) -
      (b.previousSeasonPosition ?? Number.MAX_SAFE_INTEGER),
  );
}
