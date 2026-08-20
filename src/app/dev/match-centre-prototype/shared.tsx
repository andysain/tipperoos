"use client";

// House style. Declared here and ACTUALLY followed -- the previous version
// declared three type sizes and three ink alphas, then shipped eighteen and
// twelve.
//
// TYPE: the scale is closed. Seven values, no Tailwind size keywords in app
// code, and 0.7rem is a hard floor -- nothing in this app is ever smaller,
// at any weight, on any ground. The youngest players are ten.
//
// TEXT COLOUR: named roles, not an alpha ramp. An alpha over `ink` inverts
// meaninglessly when ink becomes a light colour, which is exactly what
// DESIGN_SYSTEM.md's dark-mode section says the component layer exists to
// prevent. TEXT_MUTED is ink/70 because that is the measured AA floor
// (4.6:1 on paper); ink/35 is decorative only and never carries meaning.
//
// ACCENT: DESIGN_SYSTEM.md contradicts itself here -- line 21 says exactly
// three spots, the palette table lists a different four. Until that's
// settled (logged in docs/production-ui-findings.md), this code follows the
// STRICTER reading, which both lists agree on: accent never appears on a
// value, a label, a status chip, metadata, or a secondary link.
//
// `info` is a CATEGORY token ("never implies good or bad") -- it labels
// bots and badges. It is never a scoring tone and never a progress fill.

import { CardShell } from "@/components/ui/CardShell";
import { History } from "lucide-react";
import type { ProtoMatch, ProtoPlayer } from "./fixture";

// The closed scale.
export const T_LABEL = "text-[0.7rem]";
export const T_CAPTION = "text-[0.8rem]";
export const T_DENSE = "text-[0.9rem]";
export const T_BODY = "text-[1.0625rem]";
export const T_H2 = "text-[1.3rem]";
export const T_SCORE = "text-[1.5rem]";
export const T_H1 = "text-[1.9rem]";

// Named text roles.
export const TEXT = "text-ink";
export const TEXT_MUTED = "text-ink/70";
export const TEXT_FAINT = "text-ink/35"; // decorative only
export const ON_INK = "text-paper";
export const ON_INK_MUTED = "text-paper/70";

export const LABEL = `${T_LABEL} font-bold uppercase tracking-[0.08em]`;
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";
/** One card inset, on every card, on every screen. A card's contents never
 *  step in or out from its own header. */
export const INSET = "px-4";
export const CARD_SHADOW = "shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)]";

export function Shell({ children }: { children: React.ReactNode }) {
  return <CardShell className="bg-white">{children}</CardShell>;
}

/** 1st, 2nd, 3rd... Four copies of this exist in the repo; it belongs in
 *  src/lib/format/ when this lands. */
export function ordinal(n: number): string {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return `${n}th`;
  return `${n}${(["th", "st", "nd", "rd"] as const)[n % 10] ?? "th"}`;
}

/**
 * Tone breaks on the only two boundaries this scoring model has
 * (ADR 0012 D10): 7 is an exact score, >= 3 is the result right. Zero sits
 * at TEXT_MUTED, not TEXT_FAINT -- across a season's record `0` is the most
 * common value on the page, and it was the least legible thing on it.
 */
export function pointTone(points: number | null): string {
  if (points === null) return TEXT_FAINT;
  if (points === 7) return "text-success font-extrabold";
  if (points >= 3) return TEXT;
  if (points > 0) return TEXT_MUTED;
  return TEXT_MUTED;
}

/** `+` means exactly one thing app-wide: points gained. Never `+0`. */
export function pointLabel(points: number | null): string {
  if (points === null) return "";
  return points > 0 ? `+${points}` : "0";
}

export function Points({ points }: { points: number | null }) {
  if (points === null) {
    // Blank, not a dash. The dash already means four other things.
    return <span className="w-6" aria-hidden />;
  }
  if (points === 7) {
    return (
      <span
        className={`rounded-badge bg-success px-1.5 py-0.5 ${T_CAPTION} font-extrabold tabular-nums text-paper`}
      >
        <span className="sr-only">Exact score, </span>7
        <span className="sr-only"> points</span>
      </span>
    );
  }
  return (
    <span className={`${T_CAPTION} tabular-nums ${pointTone(points)}`}>
      <span className="sr-only">{points} points</span>
      <span aria-hidden>{pointLabel(points)}</span>
    </span>
  );
}

export type ChipTone = "you" | "human" | "bot";

/**
 * The circle chip is the only rendering of a player's emoji, per
 * DESIGN_SYSTEM.md -> Icons (2026-08-16). It was previously bare inline in
 * one place and inside the text chip in another -- three treatments for one
 * object. The ineligible mute is ink/8, a MUTE, not a hue: `info` belongs on
 * the label, never on the chip, or the palette lands on top of an identity
 * the player chose.
 */
export function PlayerChip({
  player,
  tone,
}: {
  player: ProtoPlayer;
  tone: ChipTone;
}) {
  const cls =
    tone === "you"
      ? "bg-ink text-paper"
      : tone === "bot"
        ? `bg-ink/8 ${TEXT_MUTED}`
        : `bg-ink/8 ${TEXT}`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-badge py-0.5 pl-0.5 pr-2 ${T_CAPTION} font-bold ${cls}`}
    >
      <span
        className={`grid size-5 place-items-center rounded-full text-[0.7rem] ${
          tone === "you" ? "bg-paper/20" : "bg-paper"
        }`}
        aria-hidden
      >
        {player.emoji}
      </span>
      {tone === "you" ? "You" : player.name}
    </span>
  );
}

/**
 * The audit trail is a trust feature (CLAUDE.md -> Trust, fairness), so it
 * sits directly under the result it modifies. `warning`, not `danger`:
 * nothing went wrong, something was fixed.
 */
export function AuditLine({ match }: { match: ProtoMatch }) {
  if (!match.audit) return null;
  return (
    <p
      className={`flex items-start gap-2 bg-warning/15 ${INSET} py-2.5 ${T_CAPTION} ${TEXT_MUTED}`}
    >
      <History className="mt-0.5 size-3.5 shrink-0 stroke-ink/70" aria-hidden />
      <span>
        <strong className={`font-bold ${TEXT}`}>Result corrected</strong>{" "}
        {match.audit.at} — this match was first recorded as {match.audit.from}.
        Points have been updated.
      </span>
    </p>
  );
}
