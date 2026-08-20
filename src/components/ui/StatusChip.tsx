import { MICRO_LABEL } from "./tokens";

/**
 * A match's lifecycle state. One chip, one anatomy -- the Pick Board card and
 * the Match Centre card previously carried two different specs, and `open`
 * and `locked` shared a fill, so the chip stopped carrying information at
 * exactly the moment it mattered (has the deadline passed?).
 *
 * No accent: a lifecycle status is not one of the accent budget's sanctioned
 * spots (`docs/DESIGN_SYSTEM.md` -> Accent budget), and on the Tipped Match
 * card it was competing with the one legitimate accent there -- the player's
 * own predicted scoreline.
 *
 * `called_off` is `warning`, not `danger`: a Voided Match is a neutral
 * non-event for every player equally.
 */
export type MatchChipState = "locked" | "final" | "called_off";

const TONES: Record<MatchChipState, { label: string; cls: string }> = {
  locked: { label: "Locked", cls: "bg-paper/25 text-on-ink font-extrabold" },
  final: { label: "Final", cls: "bg-paper text-ink" },
  called_off: { label: "Called off", cls: "bg-warning text-ink" },
};

export function StatusChip({ state }: { state: MatchChipState }) {
  const tone = TONES[state];
  return (
    <span
      className={`shrink-0 rounded-badge px-2 py-0.5 ${MICRO_LABEL} ${tone.cls}`}
    >
      {tone.label}
    </span>
  );
}
