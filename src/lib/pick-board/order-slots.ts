// Pure display-ordering for the Pick Board's two Tipped Match cards. The DB
// keeps its sourced slot order (match_1 = the marquee/Top Matchup, match_2 =
// the random pick -- ADR 0006) untouched; this function only decides the order
// the two cards render in: matches first, by kickoff (earliest on top), the
// marquee breaking a kickoff tie, and any Skipped Slot (no fixture) last.
// Never mutates its input.

/**
 * Orders Tipped Match cards for display. `kickoffOf` returns an item's UTC
 * kickoff ISO string, or null for a Skipped Slot (no fixture); `topMatchupOf`
 * reports whether an item is the marquee (Top Matchup) pick -- it breaks an
 * equal-kickoff tie by rendering on top. Deterministic: kickoff and the
 * marquee flag are the only inputs.
 */
export function orderBoardSlots<T>(
  items: readonly T[],
  kickoffOf: (item: T) => string | null,
  topMatchupOf: (item: T) => boolean,
): T[] {
  return [...items].sort((a, b) => {
    const kickoffA = kickoffOf(a);
    const kickoffB = kickoffOf(b);

    // A Skipped Slot has no fixture and therefore no kickoff; it sorts last.
    if (kickoffA === null && kickoffB === null) return 0;
    if (kickoffA === null) return 1;
    if (kickoffB === null) return -1;

    const timeA = new Date(kickoffA).getTime();
    const timeB = new Date(kickoffB).getTime();
    if (timeA !== timeB) return timeA - timeB;

    // Equal kickoff: the marquee (Top Matchup) breaks the tie, on top.
    if (topMatchupOf(a) !== topMatchupOf(b)) {
      return topMatchupOf(a) ? -1 : 1;
    }
    return 0;
  });
}
