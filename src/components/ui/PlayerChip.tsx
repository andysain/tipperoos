import { T, TX } from "./tokens";

/**
 * A player's emoji, always as a circle chip.
 *
 * `docs/DESIGN_SYSTEM.md` -> Icons settled this on 2026-08-16: the chip gives
 * a fixed, findable object at a consistent position, where an inline emoji
 * sits at name size and disappears into the text line. Three different
 * treatments were in use across the app when this was promoted -- circle
 * chip, bare inline, and emoji-inside-a-text-chip.
 *
 * The chip's fill is never state. A bot is muted with `ink/8` -- a mute, not
 * a hue -- because `info` on the chip puts the palette on top of an identity
 * the player chose for themselves. `info` belongs on the *label*.
 */
export function EmojiChip({
  emoji,
  size = "md",
  muted,
  onDark,
}: {
  emoji: string | null;
  size?: "sm" | "md";
  muted?: boolean;
  onDark?: boolean;
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-badge ${
        size === "sm" ? "size-5 text-[0.7rem]" : "size-9 text-lg"
      } ${muted ? "bg-ink/8" : onDark ? "bg-paper/20" : "bg-paper"}`}
      aria-hidden
    >
      {emoji ?? "⚽"}
    </span>
  );
}

export type PlayerChipTone = "you" | "human" | "bot";

/** Emoji chip + name, for the pick reveal's cluster rows. */
export function PlayerChip({
  emoji,
  name,
  tone,
}: {
  emoji: string | null;
  name: string;
  tone: PlayerChipTone;
}) {
  const cls =
    tone === "you"
      ? "bg-ink text-on-ink"
      : tone === "bot"
        ? `bg-ink/8 ${TX.muted}`
        : `bg-ink/8 ${TX.base}`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-badge py-0.5 pl-0.5 pr-2 ${T.caption} font-bold ${cls}`}
    >
      <EmojiChip emoji={emoji} size="sm" onDark={tone === "you"} />
      {tone === "you" ? "You" : name}
    </span>
  );
}
