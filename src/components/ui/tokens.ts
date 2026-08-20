// Shared class tokens for the design system's closed type scale, text roles
// and affordance rules (docs/DESIGN_SYSTEM.md). Referenced rather than
// retyped so a scale value or a contrast floor can't drift per component --
// the app previously shipped eighteen distinct type sizes against a
// seven-value spec, and twelve ink alphas against a three-role spec.

/** Closed type scale. No Tailwind size keywords in app code; 0.7rem floor. */
export const T = {
  label: "text-[0.7rem]",
  caption: "text-[0.8rem]",
  dense: "text-[0.9rem]",
  body: "text-[1.0625rem]",
  h2: "text-[1.3rem]",
  score: "text-[1.5rem]",
  h1: "text-[1.9rem]",
} as const;

/** Named text roles. `muted` is the AA floor for anything carrying meaning;
 *  `decorative` is never text a player has to read. */
export const TX = {
  base: "text-text",
  muted: "text-text-muted",
  decorative: "text-text-decorative",
  onInk: "text-on-ink",
  onInkMuted: "text-on-ink-muted",
} as const;

export const LABEL = `${T.label} font-bold uppercase tracking-[0.08em]`;
export const MICRO_LABEL = `${T.label} font-extrabold uppercase tracking-[0.06em]`;

/** Every interactive element carries this. No exceptions. A focus ring is
 *  transient chrome and does not count against the accent budget. */
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

/** One card inset, every card, every screen. */
export const INSET = "px-4";

/** The card lift-shadow, in one place. Four copies of this literal existed
 *  across the app when the token was introduced. */
export const CARD_SHADOW = "shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)]";
