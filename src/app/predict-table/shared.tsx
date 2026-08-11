import {
  ArrowDown,
  Plane,
  Minus,
  Star,
  TrendingDown,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import { type BandKey, TABLE_BANDS } from "@/lib/table-predictions/rules";
import { applyContrastFloor, INK, kitColors } from "@/lib/teams/kit-colors";
import { type FillTone } from "@/lib/table-predictions/board";

export interface Team {
  id: string;
  name: string;
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
  champions_league: { Icon: Star, positions: "2-5" },
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
// against both grounds it can be drawn on (an ink header, a white card
// body), same grounds matchBadgeColors() defaults to for the Tipped Match
// card, since a team card here only ever shows one club at a time (no
// clash rule needed -- that's a two-club-in-one-row concern).
export function teamFill(shortCode: string | null): string {
  return applyContrastFloor(kitColors(shortCode)[0], [INK, "#ffffff"]);
}

// Cards per row matches the Band's target size, so a full/correct Band
// reads as one tidy row -- with a floor of 3 so an overfull Champion (target
// 1) doesn't wrap one-per-line. Champions League holds 4, which reads badly
// as three-plus-one on a phone -- 2x2 until there's width for a single row
// (docs/predict-table-capture-spec.md "Fill-state presentation").
export function bandGridCols(band: (typeof TABLE_BANDS)[number]): string {
  if (band.key === "champions_league") return "grid-cols-2 sm:grid-cols-4";
  return Math.max(band.target, 3) >= 4 ? "grid-cols-4" : "grid-cols-3";
}

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
      <ClubCodeBadge shortCode={team.shortCode} fill={teamFill(team.shortCode)} />
      <span className={`min-w-0 truncate font-bold ${toneClassName}`}>
        {team.name}
      </span>
    </span>
  );
}
