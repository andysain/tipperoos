import type { RosterPlayer } from "@/app/_lib/admin-roster-access";

// Pure filter logic for the /admin/players roster chips
// (docs/admin-ui-spec.md §6.1), split out of RosterTable.tsx so the
// "needs attention" definition can be unit-tested without rendering a
// client component. Deliberately outside src/lib/** (same rationale as
// src/components/nav/tabs.ts): plain predicate logic, no consequence-
// critical numeric golden value.

export type RosterFilter = "all" | "humans" | "bots" | "attention";

/**
 * Needs attention = locked out, OR flagged for a PIN reset, OR filed no
 * picks for the current gameweek. A null pick count means there is no
 * current gameweek at all -- that is NOT "no picks" and never triggers
 * this (issue #200 decision 7).
 */
export function playerNeedsAttention(player: RosterPlayer): boolean {
  return (
    player.lockedUntil !== null ||
    player.pinResetRequired ||
    player.currentGameweekPickCount === 0
  );
}

export function matchesRosterFilter(
  player: RosterPlayer,
  filter: RosterFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "humans":
      return !player.isBot;
    case "bots":
      return player.isBot;
    case "attention":
      return playerNeedsAttention(player);
  }
}
