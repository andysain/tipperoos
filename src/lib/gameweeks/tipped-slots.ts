/**
 * A gameweek row's two Tipped Match slots, flattened.
 *
 * The same `[[match_1_id, match_1_voided_at], [match_2_id, match_2_voided_at]]`
 * unpack-filter-map appeared verbatim in three readers, which is three places
 * to forget that `match_N_id` being null is a **Skipped Slot** (postponed
 * before lock, no match at all) while `match_N_voided_at` being set is a
 * **Voided Match** (postponed after lock, still tipped, never scored) --
 * different facts that `CONTEXT.md` requires to stay distinct.
 */
export interface GameweekSlotRow {
  number: number;
  match_1_id: string | null;
  match_2_id: string | null;
  match_1_voided_at: string | null;
  match_2_voided_at: string | null;
}

export interface TippedSlot {
  gameweek: number;
  matchId: string;
  /** Postponed after lock: tipped, but never scored, for anyone. */
  calledOff: boolean;
  /** Which slot this was, in its sourced meaning (ADR 0006). */
  provenance: "top_matchup" | "random_pick";
}

export function tippedSlots(rows: readonly GameweekSlotRow[]): TippedSlot[] {
  return rows.flatMap((row) =>
    (
      [
        ["top_matchup", row.match_1_id, row.match_1_voided_at],
        ["random_pick", row.match_2_id, row.match_2_voided_at],
      ] as const
    )
      // A null id is a Skipped Slot -- there is no match to carry, so the
      // gameweek simply runs with one.
      .filter(([, matchId]) => matchId !== null)
      .map(([provenance, matchId, voidedAt]) => ({
        gameweek: row.number,
        matchId: matchId as string,
        calledOff: voidedAt !== null,
        provenance,
      })),
  );
}
