// Pure state-transition logic for the Band-fill capture board
// (docs/predict-table-capture-spec.md). Kept free of React so the tap
// rules for both phases -- the actual product behaviour -- can be unit
// tested directly, without rendering anything.

import { TABLE_BANDS, type BandKey } from "./rules";

export type Assignments = Record<string, BandKey>;
/** The Band each team most recently came from, one level deep -- what the
 * filling-phase toggle-revert and the undo affordance replay back to. */
export type PriorBandByTeam = Record<string, BandKey | null>;

/** PROTOTYPE: a monotonic sequence number per placed team, recording the
 * order clubs landed in their current Band. Only ever read to answer "which
 * club leaves if one more arrives in a full Band" -- the eviction rule is
 * last-in-first-out, so the club most recently added is the one displaced. */
export type PlacedAt = Record<string, number>;

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
 * PROTOTYPE: superseded by `tapWithEviction`, which is the same rule plus a
 * hard cap at the Band's target size. Kept (and still unit-tested) so the
 * over-fill-permitted behaviour ADR 0008 decided is one import swap away.
 *
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
 * PROTOTYPE: which club leaves `band` if one more arrives while it is full.
 * Last-in-first-out -- the most recently added club is the one displaced,
 * because "I've just changed my mind about that one" is the only rule a
 * player can predict. Ties (and clubs with no recorded sequence, e.g. an
 * assignment loaded from the server) fall back to team id so the answer is
 * deterministic. Null when the Band is empty.
 *
 * This is what makes eviction *stated before it happens*: the returned club
 * is marked "Next out" in the open Band whenever that Band is full.
 */
export function nextOutTeam(
  assignments: Assignments,
  placedAt: PlacedAt,
  band: BandKey,
): string | null {
  const members = Object.keys(assignments).filter(
    (teamId) => assignments[teamId] === band,
  );
  if (members.length === 0) return null;
  return members.reduce((latest, teamId) => {
    const a = placedAt[teamId] ?? -1;
    const b = placedAt[latest] ?? -1;
    if (a !== b) return a > b ? teamId : latest;
    return teamId > latest ? teamId : latest;
  });
}

export interface EvictionTapResult extends TapResult {
  placedAt: PlacedAt;
  /** The club pushed back to the roster to make room, or null if the Band
   * had a free slot. Never the tapped club itself. */
  evicted: { teamId: string; from: BandKey } | null;
}

/**
 * PROTOTYPE tap rule, replacing `tapWhileFilling`: a Band can never exceed
 * its target size. Tapping a club into a full Band swaps it in for that
 * Band's "next out" club, which returns to the roster.
 *
 * The point is the invariant it buys: with over-filling impossible,
 * `placed === 20` implies every Band is exactly its target size, which
 * implies every Band Bonus is in play. One number tells the player
 * everything, instead of eight counters plus a submit-time warning.
 *
 * The cost, which is real: an evicted club is *unplaced*, and unplaced
 * scores 0 while a mis-Banded club still scores 1-2 on Band distance. That
 * is why eviction is marked in advance and always undoable, and why the
 * evicted club is never silently re-homed somewhere the player didn't choose.
 *
 * Tapping a club already in `openBand` still toggle-reverts it to
 * `previous[teamId]`, exactly as before -- that path never evicts.
 */
export function tapWithEviction(
  state: BoardState & { placedAt: PlacedAt },
  teamId: string,
  openBand: BandKey,
  target: number,
  seq: number,
): EvictionTapResult {
  const current = state.assignments[teamId] ?? null;

  if (current === openBand) {
    const back = state.previous[teamId] ?? null;
    const assignments = { ...state.assignments };
    const placedAt = { ...state.placedAt };
    if (back) {
      assignments[teamId] = back;
      placedAt[teamId] = seq;
    } else {
      delete assignments[teamId];
      delete placedAt[teamId];
    }
    return {
      assignments,
      previous: state.previous,
      placedAt,
      movedFrom: null,
      evicted: null,
    };
  }

  const occupancy = Object.values(state.assignments).filter(
    (band) => band === openBand,
  ).length;
  const evictedId =
    occupancy >= target
      ? nextOutTeam(state.assignments, state.placedAt, openBand)
      : null;

  const assignments = { ...state.assignments };
  const previous = { ...state.previous };
  const placedAt = { ...state.placedAt };

  if (evictedId) {
    delete assignments[evictedId];
    delete placedAt[evictedId];
    previous[evictedId] = openBand;
  }

  assignments[teamId] = openBand;
  previous[teamId] = current;
  placedAt[teamId] = seq;

  return {
    assignments,
    previous,
    placedAt,
    movedFrom: current,
    evicted: evictedId ? { teamId: evictedId, from: openBand } : null,
  };
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

export interface SwapResult {
  assignments: Assignments;
  previous: PriorBandByTeam;
  /** Each team's Band before the swap, for the swap undo affordance. */
  swapped: [
    { teamId: string; movedFrom: BandKey },
    { teamId: string; movedFrom: BandKey },
  ];
}

/**
 * PROTOTYPE: unused. The review *phase* is gone -- there is one grammar now
 * (open a Band, tap clubs into it), so there is no lifted club and nothing
 * to swap with. Kept intact, with its tests, so restoring the two-grammar
 * board is a matter of re-wiring PredictTableFlow rather than rewriting it.
 *
 * Review-phase swap (team-first): exchange the Bands of two already-placed
 * teams in one move (issue #131). Both teams are assumed already placed --
 * the review-mode tap grammar only ever calls this with two placed teams,
 * since review mode itself only exists once all 20 teams are placed.
 *
 * Symmetric: calling swapBands again with the same two ids restores both
 * teams to their pre-swap Bands, which is what the swap undo affordance
 * relies on instead of a separate undo primitive.
 */
export function swapBands(
  state: BoardState,
  teamA: string,
  teamB: string,
): SwapResult {
  const bandA = state.assignments[teamA];
  const bandB = state.assignments[teamB];
  const assignments = {
    ...state.assignments,
    [teamA]: bandB,
    [teamB]: bandA,
  };
  const previous = { ...state.previous, [teamA]: bandA, [teamB]: bandB };
  return {
    assignments,
    previous,
    swapped: [
      { teamId: teamA, movedFrom: bandA },
      { teamId: teamB, movedFrom: bandB },
    ],
  };
}

/** Start again: every club back to the roster. The only escape from a
 * table a player wants to bin, and the only operation that can't be
 * reconstructed from cheap individual moves. */
export function startAgain(): BoardState {
  return { assignments: {}, previous: {} };
}

/** Band fill counts, branded so an Assignments map can never be passed
 * where counts are expected -- the two shapes collide structurally and did
 * once, silently disabling #118's ceremony (the weak-type rule let
 * `Record<string, BandKey>` through where `Partial<Record<BandKey,
 * number>>` was expected). Only countsOf constructs one. */
export type BandCounts = Partial<Record<BandKey, number>> & {
  readonly [countsBrand]: true;
};

declare const countsBrand: unique symbol;

/** Band fill counts from an assignments map -- the shape the landing, the
 * ceremony trigger, and validateBandCounts read. */
export function countsOf(assignments: Assignments): BandCounts {
  const result: Partial<Record<BandKey, number>> = {};
  for (const band of Object.values(assignments)) {
    result[band] = (result[band] ?? 0) + 1;
  }
  return result as BandCounts;
}

/** The #118 return-visit landing: the first Band in canonical table order
 * whose fill count is incorrect (actual !== target, over-filled included --
 * that is still work in filling mode). Champion for an empty board, so a
 * first visit is unchanged; null when every Band is exactly filled (which
 * in practice means the board is in review mode, where the landing does not
 * apply). Distinct from nextUnfilledBand, which is the in-session advance
 * prompt: forward-from-current only and strictly under target. */
export function firstIncorrectlyFilledBand(counts: BandCounts): BandKey | null {
  for (const band of TABLE_BANDS) {
    if ((counts[band.key] ?? 0) !== band.target) return band.key;
  }
  return null;
}

/** The #118 champion ceremony trigger: the champion band's count moved from
 * 0 to 1 -- the champion was *named*. A second team into the band only
 * over-fills it (never returns to 0), an undo moves counts the other way,
 * and a swap leaves the count unchanged. Review-mode drops can move the
 * count 0 -> 1 too, but the ceremony belongs to the filling tap that names
 * the champion -- the flow only checks this on the tap path. */
export function championWasNamed(
  previousCounts: BandCounts,
  nextCounts: BandCounts,
): boolean {
  return (
    (previousCounts.champion ?? 0) === 0 && (nextCounts.champion ?? 0) === 1
  );
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

/**
 * The next Band, in canonical table order, that still has room -- searched
 * forward from `currentBand` only, never wrapping and never looking back.
 * Over-filled Bands are skipped past (issue #130): they don't need the
 * advance prompt's help, so "unfilled" here means strictly under target.
 * Distinct from #118's return-visit landing, which searches from the very
 * start of the sequence for the first *incorrectly* filled Band instead.
 */
export function nextUnfilledBand(
  currentBand: BandKey,
  counts: Partial<Record<BandKey, number>>,
): BandKey | null {
  const currentIndex = TABLE_BANDS.findIndex((b) => b.key === currentBand);
  for (let i = currentIndex + 1; i < TABLE_BANDS.length; i++) {
    const band = TABLE_BANDS[i];
    if ((counts[band.key] ?? 0) < band.target) return band.key;
  }
  return null;
}

/** 1-based position of `band` in the canonical Band sequence, for the
 * "Band 3 of 8" progress readout. */
export function bandPosition(band: BandKey): number {
  return TABLE_BANDS.findIndex((b) => b.key === band) + 1;
}

export type Mode = "filling" | "review";

/**
 * PROTOTYPE: unused. The board no longer has two modes at all -- it has zero
 * or one *open Band*, and "review" is simply what the board looks like when
 * nothing is open. That removes the unsignalled grammar switch which fired
 * the instant the 20th club landed, and which is the thing that made this
 * screen feel unintuitive. Kept so ADR 0008's model can be restored.
 */
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

export interface DemotedRoster<T> {
  /** Unplaced clubs first, then placed ones -- each group keeping last
   * season's order internally, so the list is re-grouped, never re-sorted. */
  ordered: T[];
  /** Index the placed group starts at, so the boundary can be captioned.
   * Captured here rather than re-derived from assignments at render time:
   * a club placed *since* the last re-group is deliberately still sitting
   * in the top group, and deriving would yank it down immediately. */
  demotedFrom: number;
}

/**
 * PROTOTYPE: pushes already-placed clubs to the bottom of the roster.
 *
 * Called only when the open Band changes, never on a tap. That is the whole
 * point: while you are filling one Band the list is frozen, so nothing
 * shifts under your finger between taps -- the failure mode that made ADR
 * 0008 specify fixed roster positions in the first place. The list re-settles
 * only at a moment the player is already changing context.
 *
 * Softer than hiding placed clubs: they stay present and tappable, so
 * pulling a club out of one Band into another still works with no extra
 * disclosure control, and ADR 0008's "have I done Wolves yet?" is still
 * answerable from the roster alone.
 */
export function demotePlaced<T extends { id: string }>(
  roster: readonly T[],
  assignments: Assignments,
): DemotedRoster<T> {
  const unplaced = roster.filter((team) => !assignments[team.id]);
  const placed = roster.filter((team) => assignments[team.id]);
  return { ordered: [...unplaced, ...placed], demotedFrom: unplaced.length };
}
