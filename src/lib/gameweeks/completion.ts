/**
 * Gameweek scoring-completion predicate — issue #166 D3. Distinct from
 * `slotIsOpen()` in ./resolve.ts, which answers "is this slot still open for
 * picks" (kickoff-time vs. lock); this answers "has this slot finished
 * scoring," driven by `matches.status` and voided-ness instead.
 *
 * Deliberately reuses `isMatchVoided` (src/lib/matches/voided.ts) for its
 * voided check rather than checking `voidedAt !== null` alone. Issue #166's
 * own decision log initially specified voided_at alone; that was corrected
 * during implementation once the same combined signal (voided_at OR
 * status === "postponed") turned up independently established in both
 * scripts/scripted-gameweek-simulation/driver.ts's `isMatchVoided` and
 * src/app/_lib/pick-board-access.ts's `buildSlot` -- nothing guarantees
 * `gameweeks.match_N_voided_at` gets set in the same instant `matches.status`
 * flips to postponed, so voided_at alone would have a window where a
 * postponed match reads as still pending.
 */

import { isMatchVoided } from "@/lib/matches/voided";
import type { MatchStatus } from "@/lib/matches/map-matches";

export interface ScoringSlot {
  /** Null = a Skipped Slot (fixture postponed before lock, never entered scoring). */
  matchId: string | null;
  /** Null iff matchId is null. */
  status: MatchStatus | null;
  voidedAt: string | null;
}

export function isSlotScoringDone(slot: ScoringSlot): boolean {
  if (slot.matchId === null) return true;
  if (slot.status === "completed") return true;
  return isMatchVoided([{ voidedAt: slot.voidedAt }], slot.status ?? "scheduled");
}

export function isGameweekScoringComplete(
  match1: ScoringSlot,
  match2: ScoringSlot,
): boolean {
  return isSlotScoringDone(match1) && isSlotScoringDone(match2);
}
