/**
 * Voided Match detection — promoted from issue #22's simulation driver
 * (scripts/scripted-gameweek-simulation/driver.ts) to src/lib/ once a second
 * production consumer needed it (issue #166's sync-scoring orchestrator),
 * per docs/standards/TESTING_STANDARD.md §6 ("promote to src/lib the moment
 * a second route needs the same logic -- don't copy-paste it").
 *
 * `voidedAt` is the authoritative Voided Match signal (CLAUDE.md), but also
 * defensively treat `matches.status === "postponed"` as voided on its own --
 * nothing guarantees a sync step sets `gameweeks.match_N_voided_at` in the
 * same instant `matches.status` flips to postponed, so trusting `voidedAt`
 * alone would have a window where a postponed match reads as still live.
 * The same combined signal is independently established in
 * src/app/_lib/pick-board-access.ts's `buildSlot` (pre-lock pick-entry
 * gating) -- this is that same rule, not a new one.
 */

export interface MatchSlotVoidSignal {
  voidedAt: string | null;
}

/**
 * A match is voided when any gameweek slot referencing it has been voided
 * (`gameweeks.match_1_voided_at`/`match_2_voided_at`) or its own status is
 * `postponed`. No referencing slot + a non-postponed status => not voided.
 */
export function isMatchVoided(
  slots: MatchSlotVoidSignal[],
  matchStatus: string,
): boolean {
  return (
    matchStatus === "postponed" || slots.some((slot) => slot.voidedAt !== null)
  );
}
