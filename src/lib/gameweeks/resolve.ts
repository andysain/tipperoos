// Shared current-gameweek resolver -- see docs/adr/0007-home-surface-and-pick-entry.md
// ("The current Gameweek is derived, never flagged: lowest-numbered Gameweek
// in this season and Competition with any Tipped Match not yet locked;
// failing that, the highest-numbered Gameweek that has Tipped Matches.")
// No `is_current` column exists on purpose -- a missed job leaves a flag
// confidently wrong, where this self-heals from kickoff times every request.

import { isMatchLocked } from "@/lib/competitions/scope";

/**
 * One Tipped Match slot on a gameweek. `matchId` is null for a Skipped Slot
 * (fixture postponed before lock, docs/adr/0001-skip-slot-on-pre-lock-postponement.md)
 * -- `kickoffTime` is null iff `matchId` is null. `voidedAt` is set when the
 * fixture was postponed after picks locked (CLAUDE.md -> Predictions); a
 * voided slot was genuinely tipped but is always locked by definition.
 */
export interface GameweekSlot {
  matchId: string | null;
  kickoffTime: Date | null;
  voidedAt: Date | null;
}

export interface CandidateGameweek {
  number: number;
  match1: GameweekSlot;
  match2: GameweekSlot;
}

function slotHasTippedMatch(slot: GameweekSlot): boolean {
  return slot.matchId !== null;
}

function slotIsOpen(slot: GameweekSlot, now: Date): boolean {
  if (slot.matchId === null || slot.kickoffTime === null) return false;
  if (slot.voidedAt !== null) return false;
  return !isMatchLocked(slot.kickoffTime, now);
}

/**
 * Lowest-numbered gameweek with a Tipped Match not yet locked; failing
 * that, the highest-numbered gameweek that has any Tipped Match at all
 * (locked, voided, or otherwise). Null when no gameweek has ever had a
 * Tipped Match -- e.g. before gameweek 1 is seeded.
 */
export function resolveCurrentGameweek(
  gameweeks: CandidateGameweek[],
  now: Date,
): number | null {
  const sorted = [...gameweeks].sort((a, b) => a.number - b.number);

  for (const gameweek of sorted) {
    if (slotIsOpen(gameweek.match1, now) || slotIsOpen(gameweek.match2, now)) {
      return gameweek.number;
    }
  }

  let fallback: number | null = null;
  for (const gameweek of sorted) {
    if (
      slotHasTippedMatch(gameweek.match1) ||
      slotHasTippedMatch(gameweek.match2)
    ) {
      fallback = gameweek.number;
    }
  }

  return fallback;
}
