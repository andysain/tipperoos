// Pure state-transition logic for the Band-fill capture board
// (docs/predict-table-capture-spec.md). Kept free of React so the tap
// rule -- the actual product behaviour -- can be unit tested directly,
// without rendering anything.

import { TABLE_BANDS, type BandKey } from "./rules";

export type Assignments = Record<string, BandKey>;
/** The Band each team most recently came from, one level deep -- what the
 * filling-phase toggle-revert and the undo affordance replay back to. */
export type PriorBandByTeam = Record<string, BandKey | null>;

/** A monotonic sequence number per placed team, recording the order clubs
 * landed in their current Band. Only ever read to answer "which club leaves
 * if one more arrives in a full Band" -- the eviction rule is
 * last-in-first-out, so the club most recently added is the one displaced. */
export type PlacedAt = Record<string, number>;

/**
 * The whole capture board. These three always travel together -- every tap,
 * every rollback and every snapshot moves all three or none of them -- so
 * they are one type rather than three parameters that have to be kept in
 * step by hand at each call site.
 */
export interface BoardState {
  assignments: Assignments;
  previous: PriorBandByTeam;
  placedAt: PlacedAt;
}

export interface TapResult extends BoardState {
  /** The Band the team moved out of, for the undo affordance -- null for a
   * fresh placement or a toggle-revert (spec: undo only names a Band the
   * team came *from*). */
  movedFrom: BandKey | null;
}

/**
 * The next placement sequence number, derived from the board rather than
 * held alongside it. A separate counter is one more thing every rollback
 * has to remember to restore, and forgetting it desyncs the eviction order
 * from the board it describes -- which is exactly the bug a failed "Start
 * again" used to have. Deriving it makes that class of desync unstateable.
 */
export function nextSeq(placedAt: PlacedAt): number {
  return Math.max(-1, ...Object.values(placedAt)) + 1;
}

/**
 * Which club leaves `band` if one more arrives while it is full.
 * Last-in-first-out -- the most recently added club is the one displaced,
 * because "I've just changed my mind about that one" is the only rule a
 * player can predict. Ties (and clubs with no recorded sequence, e.g. an
 * assignment loaded from the server) fall back to team id so the answer is
 * deterministic. Null when the Band is empty.
 *
 * This is what makes eviction *stated before it happens*: the plain-English
 * line above the roster (see PredictTableFlow) names the returned club
 * whenever the open Band is full.
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
  /** The club pushed back to the roster to make room, or null if the Band
   * had a free slot. Never the tapped club itself. */
  evicted: { teamId: string; from: BandKey } | null;
}

/**
 * The tap rule: a Band can never exceed its target size. Tapping a club
 * into a full Band swaps it in for that Band's "next out" club, which
 * returns to the roster.
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
  state: BoardState,
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
    delete assignments[teamId];
    delete placedAt[teamId];

    // The toggle-revert has to respect the capacity rule too, or the
    // headline invariant ("a Band can never exceed its target") is
    // breakable: move a club out of a full Band, refill that Band, then
    // toggle the club back and it lands in a Band that is full again.
    //
    // When there is no longer room the club goes back to the roster
    // unplaced rather than evicting a third club to make space. Evicting
    // here would be an eviction the player was never shown -- the "next
    // out" marker only ever describes the *open* Band -- and an unannounced
    // one is exactly what the eviction design is careful to avoid.
    const backTarget = back
      ? (TABLE_BANDS.find((b) => b.key === back)?.target ?? 0)
      : 0;
    const backHasRoom =
      back !== null &&
      Object.values(assignments).filter((band) => band === back).length <
        backTarget;

    if (backHasRoom) {
      assignments[teamId] = back;
      placedAt[teamId] = seq;
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

/** One assign-or-unassign request a tap implies. `band: null` means
 * unassign (the team ends up back in the roster); any other value means
 * assign into that Band. */
export interface TapRequestPlan {
  teamId: string;
  band: BandKey | null;
}

/**
 * The request(s) a tap implies: one for the tapped club (assign into the
 * Band it landed in, or unassign if the tap was a toggle-revert to
 * unplaced), plus a second unassign for the evicted club if the tap caused
 * an eviction. PredictTableFlow fires both in parallel -- they touch
 * different rows, so there's no ordering dependency between them.
 */
export function planTapRequests(
  teamId: string,
  result: Pick<EvictionTapResult, "assignments" | "evicted">,
): TapRequestPlan[] {
  const landedIn = result.assignments[teamId] ?? null;
  const requests: TapRequestPlan[] = [{ teamId, band: landedIn }];
  if (result.evicted) {
    requests.push({ teamId: result.evicted.teamId, band: null });
  }
  return requests;
}

/**
 * What the board should show once an optimistic change's requests have
 * settled: the new state if every request saved, the pre-change state if
 * any failed. Every path that writes to the server goes through this --
 * a tap, an undo, and a Start again -- so "what does a failed save do to
 * the board" is one decision in one place, made on the whole board at
 * once, rather than three hand-rolled rollbacks that can each forget a
 * field. Forgetting one is not hypothetical: Start again used to restore
 * the assignments but not the placement order.
 */
export function settleBoard(
  before: BoardState,
  after: BoardState,
  allRequestsSucceeded: boolean,
): BoardState {
  return allRequestsSucceeded ? after : before;
}

export interface TapSnapshot extends BoardState {
  /** The team ids the tap touched -- one for a plain move, two for an
   * eviction -- and so the only ids the undo needs to re-persist. */
  teamIds: string[];
}

/**
 * The undo affordance's replay: assign or unassign each team the tap
 * touched back to its Band **as recorded in the snapshot**, taken
 * immediately before the tap -- not as an inverse of the tap itself. An
 * eviction changes two clubs in one action, and by the time undo runs the
 * evicted club's old Band is full again (the club that replaced it is
 * still there), so "move it back" is not always a legal tap. Reading the
 * target Band straight from the snapshot sidesteps that: both clubs are
 * restored to states that were legal a moment ago, independent of what
 * order the two requests land in.
 */
export function planUndoRequests(snapshot: TapSnapshot): TapRequestPlan[] {
  return snapshot.teamIds.map((teamId) => ({
    teamId,
    band: snapshot.assignments[teamId] ?? null,
  }));
}

/** Start again: every club back to the roster. The only escape from a
 * table a player wants to bin, and the only operation that can't be
 * reconstructed from cheap individual moves. */
export function startAgain(): BoardState {
  return { assignments: {}, previous: {}, placedAt: {} };
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
 * first visit is unchanged; null when every Band is exactly filled, which
 * is what lands a finished board with every Band collapsed -- the whole
 * table on one screen -- rather than dropping the player into an edit.
 * Distinct from nextUnfilledBand, which is the in-session advance prompt:
 * forward-from-current only and strictly under target. */
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

/**
 * The order clubs are listed in *within* a Band -- alphabetical,
 * deliberately.
 *
 * Only Band membership scores; order inside a Band carries no weight at all
 * (CLAUDE.md, and ADR 0010's placement table reads Bands, never positions).
 * But once members are stacked vertically under a "3-5" badge, the layout
 * asserts the opposite: first is 3rd, second is 4th, third is 5th. ADR 0008
 * rejected a full 1-20 list partly to avoid making "9th or 10th?" a visible
 * decision that doesn't score, and a vertical stack quietly reintroduces it.
 *
 * Alphabetical is the fix, and it's a behavioural one rather than a caption:
 * a player who puts Liverpool in first and sees it render third learns
 * immediately that this order isn't theirs and isn't being recorded. Any
 * order derived from the player's own actions (insertion) or from a
 * meaningful metric (last season's finish) would read as a ranking instead.
 */
export function bandMemberOrder<T extends { displayName: string }>(
  teams: readonly T[],
): T[] {
  return [...teams].sort((a, b) => a.displayName.localeCompare(b.displayName));
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
 * Pushes already-placed clubs to the bottom of the roster.
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
