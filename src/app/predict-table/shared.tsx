import {
  ArrowDown,
  Medal,
  Plane,
  Minus,
  Star,
  TrendingDown,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { tv } from "tailwind-variants";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import { type BandKey, TABLE_BANDS } from "@/lib/table-predictions/rules";
import { applyContrastFloor, kitColors } from "@/lib/teams/kit-colors";
import { type FillTone } from "@/lib/table-predictions/board";

export interface Team {
  id: string;
  name: string;
  displayName: string;
  shortCode: string | null;
  previousSeasonPosition: number | null;
}

export function ordinal(n: number): string {
  const hundredRemainder = n % 100;
  if (hundredRemainder >= 11 && hundredRemainder <= 13) return `${n}th`;
  const suffix = (["th", "st", "nd", "rd"] as const)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

// Functional wayfinding icon per Band (lucide-react, matches the Pick
// Board's Star/Dices convention -- docs/DESIGN_SYSTEM.md § Icons: emoji
// stay the personalization layer and must never stand in for a functional
// icon). Bands render neutral -- no per-band semantic tint (issue #107).
export const BAND_META: Record<
  BandKey,
  { Icon: typeof Trophy; positions: string }
> = {
  champion: { Icon: Trophy, positions: "1" },
  runners_up: { Icon: Medal, positions: "2" },
  champions_league: { Icon: Star, positions: "3-5" },
  europe: { Icon: Plane, positions: "6-8" },
  mid_table: { Icon: Minus, positions: "9-11" },
  lower_table: { Icon: TrendingDown, positions: "12-14" },
  relegation_battle: { Icon: TriangleAlert, positions: "15-17" },
  relegated: { Icon: ArrowDown, positions: "18-20" },
};

export const BAND_LABEL: Record<BandKey, string> = Object.fromEntries(
  TABLE_BANDS.map((b) => [b.key, b.label]),
) as Record<BandKey, string>;

// A team's identity fill for its rail + ClubCodeBadge -- contrast-floored
// against white, the only ground it's ever drawn on across this feature
// (BandsBoard's cards, BandSummary's rows, SubmittedMoment/TeamIdentity's
// occupant rows). Unlike the Tipped Match card, nothing here draws a kit
// colour on an ink ground -- flooring against ink too would needlessly
// wash a dark, saturated kit colour toward pink (issue: Aston Villa
// reading as pink, Liverpool not reading as Liverpool red).
export function teamFill(shortCode: string | null): string {
  return applyContrastFloor(kitColors(shortCode)[0], ["#ffffff"]);
}

// Full team names don't survive being packed target-many-per-row on a
// phone (a 3- or 4-column grid at mobile width truncates every club to
// "AFC Bourn…"), so placed-team cards stay a single full-width column --
// legible at real size -- until sm: (640px+) has genuine room for a second
// column without truncating anything.
export const PLACED_TEAM_GRID_COLS = "grid-cols-1 sm:grid-cols-2";

// Ground treatment per fill state -- tint means "something to do here" and
// nothing else. A Band that is exactly right stays plain, so the board
// opens fully washed and visibly calms down as it's finished, rather than
// colouring in both the resolved and unresolved states.
export const FILL_GROUND: Record<FillTone, string> = {
  under: "border-paper-line bg-ink/[0.03]",
  ok: "border-paper-line bg-white",
  over: "border-danger/50 bg-danger/5",
};

export const FILL_COUNT_TEXT: Record<FillTone, string> = {
  under: "text-ink/40 font-semibold",
  ok: "text-ink/70 font-extrabold",
  over: "text-danger font-bold",
};

// An expanded Band's ink header switches away from plain ink when its count
// is wrong, so the state reads at the header's full width rather than only
// in the small count chip -- "under" warms toward the warning tone, "over"
// goes to the danger tone outright (an over-filled Band is actively wrong,
// not just incomplete). "ok" keeps the default ink from CardShellHeader.
export const HEADER_BACKGROUND: Record<FillTone, string | undefined> = {
  under: "color-mix(in oklab, var(--color-ink) 72%, var(--color-warning) 28%)",
  ok: undefined,
  over: "var(--color-danger)",
};

// A visual divider for the one boundary in this table that isn't just
// another Band change -- the real cliff-edge of a Premier League season.
export function DropDivider() {
  return (
    <div className="my-1 flex items-center gap-2" aria-hidden>
      <span
        className="h-1 flex-1 rounded-full opacity-70"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, var(--color-danger) 0 6px, transparent 6px 12px)",
        }}
      />
      <span className="shrink-0 text-[0.65rem] font-extrabold tracking-[0.2em] text-danger uppercase">
        The Drop
      </span>
      <span
        className="h-1 flex-1 rounded-full opacity-70"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-45deg, var(--color-danger) 0 6px, transparent 6px 12px)",
        }}
      />
    </div>
  );
}

/** A team's club-code badge + name, at whatever text color its ground
 * needs (#106's kit-filled badge). */
export function TeamIdentity({
  team,
  toneClassName = "text-ink",
}: {
  team: Team;
  toneClassName?: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ClubCodeBadge
        shortCode={team.shortCode}
        fill={teamFill(team.shortCode)}
      />
      <span className={`min-w-0 truncate font-bold ${toneClassName}`}>
        {team.name}
      </span>
    </span>
  );
}

export type BandTone = "success" | "info" | "warning" | "danger" | "neutral";

// A handful of falling confetti pieces, reusing the existing semantic
// tones (never a new color -- DESIGN_SYSTEM.md's "no other colors" rule).
// Purely decorative: always rendered aria-hidden inside a
// pointer-events-none wrapper, and skipped outright under
// prefers-reduced-motion rather than just not animating. Shared by the
// submit moment and the champion ceremony (issue #118).
export const CONFETTI: { left: number; delay: number; tone: BandTone }[] = [
  { left: 8, delay: 0, tone: "success" },
  { left: 20, delay: 0.08, tone: "warning" },
  { left: 33, delay: 0.02, tone: "info" },
  { left: 46, delay: 0.14, tone: "danger" },
  { left: 58, delay: 0.05, tone: "success" },
  { left: 70, delay: 0.11, tone: "info" },
  { left: 82, delay: 0.03, tone: "warning" },
  { left: 92, delay: 0.09, tone: "danger" },
];

export const confettiPiece = tv({
  base: "absolute top-0 h-2 w-2 rounded-sm motion-safe:animate-confetti-fall",
  variants: {
    tone: {
      success: "bg-success",
      info: "bg-info",
      warning: "bg-warning",
      danger: "bg-danger",
      neutral: "bg-ink/30",
    },
  },
});

/** The falling-confetti render shared by the submit moment and the
 * champion ceremony -- one home for the visual so the "no other colors"
 * rule stays enforceable in a single place. Invariantly decorative:
 * aria-hidden, pointer-events-none, skipped outright under
 * prefers-reduced-motion. The call site picks the positioning: `absolute`
 * inside the submit moment's dialog, `fixed` for the viewport overlay. */
export function ConfettiBurst({
  position,
}: {
  position: "fixed" | "absolute";
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none motion-reduce:hidden ${
        position === "fixed"
          ? "fixed inset-x-0 top-0 z-20"
          : "absolute inset-x-0 top-0"
      }`}
    >
      {CONFETTI.map((piece, index) => (
        <span
          key={index}
          className={confettiPiece({ tone: piece.tone })}
          style={{
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
