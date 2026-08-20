/**
 * What a gameweek's total *means* when there isn't one.
 *
 * A single nullable total previously carried four different facts, so a week
 * that was called off -- or one that simply hadn't finished -- rendered as
 * "no picks" and accused a player of not turning up. `CLAUDE.md` -> Scoring
 * makes "No pick, no points" a rule with real weight, and
 * `docs/adr/0012-leaderboard-view.md` D3 works hard elsewhere to stop absence
 * reading as poor form; collapsing these four into one undoes both.
 *
 * Pure, so the two surfaces that render a week heading (the Pick Board's
 * recap and the picks record) can't drift apart on it.
 */
export interface WeekEntry {
  /** Null when this match has no result yet. */
  points: number | null;
  /** Did this player file a pick for this match? */
  picked: boolean;
  /** Postponed after lock: no points either way, for anyone. */
  calledOff: boolean;
}

export type WeekOutcome =
  | { kind: "scored"; total: number; pending: boolean }
  | { kind: "no_picks" }
  | { kind: "not_scored" }
  | { kind: "called_off" };

export function deriveWeekOutcome(entries: readonly WeekEntry[]): WeekOutcome {
  if (entries.length === 0) return { kind: "no_picks" };

  const scored = entries.filter((e) => e.points !== null);
  if (scored.length > 0) {
    return {
      kind: "scored",
      total: scored.reduce((sum, e) => sum + (e.points ?? 0), 0),
      // A gameweek is routinely half-played: the two tipped matches often
      // kick off a day apart. The total is real but incomplete, and saying
      // so is the difference between "you scored 5" and "5 so far".
      pending: entries.some((e) => !e.calledOff && e.points === null),
    };
  }

  if (entries.every((e) => e.calledOff)) return { kind: "called_off" };
  if (entries.some((e) => e.picked)) return { kind: "not_scored" };
  return { kind: "no_picks" };
}
