import { MICRO_LABEL } from "./tokens";

/**
 * The "You" badge beside a player's own name. Gold is the default -- one of
 * DESIGN.md's functional accents -- and `ink` is for where gold would be a
 * second accent object in the same viewport, or would sit on the 1st-place
 * gold tint with almost no edge (ink-as-surface is sanctioned grammar).
 */
export function YouPill({ tone = "accent" }: { tone?: "accent" | "ink" }) {
  return (
    <span
      className={`shrink-0 rounded-badge px-1.5 py-0.5 ${MICRO_LABEL} ${
        tone === "ink" ? "bg-ink text-on-ink" : "bg-accent text-accent-ink"
      }`}
    >
      You
    </span>
  );
}
