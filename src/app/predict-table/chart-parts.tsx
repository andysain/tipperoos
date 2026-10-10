"use client";

// The pieces of G, the dumbbell view, shared by the comparison (TableCompare,
// issue #214) and the one-player view (TableSingle, issue #226). Lifted out
// of TableCompare unchanged in look, so the two views draw a mark, a bar, a
// Band heading or a tap card identically. The design decisions behind every
// piece are logged in #214 (D10-D14) and #226 (S5, S7).

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Check, Info, Star, X } from "lucide-react";
import {
  BOLD_CALL_BONUS,
  MAX_BOLD_CALLS,
  PLACEMENT_POINTS_BY_DISTANCE,
  TABLE_BANDS as SCORING_BANDS,
} from "@/lib/scoring/predict-table";
import { TABLE_BANDS } from "@/lib/table-predictions/rules";
import { distanceLabel, type SideCall } from "@/lib/table-predictions/compare";
import { BAND_META, ordinal, teamFill } from "./shared";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import { pointLabel } from "@/components/ui/Points";
import {
  CARD_SHADOW,
  FOCUS,
  INSET,
  LABEL,
  MICRO_LABEL,
  T,
  TX,
} from "@/components/ui/tokens";

/**
 * Whose call a mark draws. "own" is the viewer's -- Trophy Gold, which
 * DESIGN.md's Accent Budget Rule spends on a player's own calls; "peer" is
 * anyone else's -- outline ink, never Neutral Teal (#214, #226 S5).
 */
export type Tone = "own" | "peer";

export const BAND_COUNT = TABLE_BANDS.length;
export const BOLD_CALL_KEY = `Bold Call +${String(BOLD_CALL_BONUS)}`;

export const pct = (n: number) => `${String((n * 100) / BAND_COUNT)}%`;
export const centre = (band: number) => pct(band + 0.5);

// --- Marks ------------------------------------------------------------------

// Drawn once so the lanes, the key, the sticky header, the chips and the
// tiles all use the exact same shapes -- never a glyph standing in for them.
export function Mark({
  tone,
  hit = false,
  size = "size-3",
  className = "",
  style,
}: {
  tone: Tone;
  /** On the finish line: the right Band. */
  hit?: boolean;
  size?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`grid ${size} shrink-0 place-items-center rounded-badge ${
        tone === "own"
          ? "bg-accent ring-1 ring-ink"
          : "border-2 border-ink bg-surface"
      } ${className}`}
      style={style}
    >
      {/* A direct hit carries an ink tick: "right", in the mark's own
          colours -- gold always carries ink (DESIGN.md -> Trophy Gold), so
          no second colour lands on it. */}
      {hit ? (
        <Check className={`size-2.5 stroke-[3.5] ${TX.base}`} aria-hidden />
      ) : null}
    </span>
  );
}

/** The bar colour for a tone: gold for your own call, muted ink otherwise. */
function barClass(tone: Tone): string {
  return tone === "own" ? "h-1.5 bg-accent" : "h-0.5 bg-text-muted";
}

// --- Key ----------------------------------------------------------------------

/**
 * The key's second tier: how to read the chart, one quiet row of same-sized
 * samples with short labels, drawn in the tone of the chart's main subject.
 * Entries for things not on this chart are left out.
 */
export function KeySamples({
  tone,
  showBoldCall,
  showExactBand,
}: {
  tone: Tone;
  showBoldCall: boolean;
  showExactBand: boolean;
}) {
  const item = "flex items-center gap-1.5";
  // Every sample sits in the same box, so the labels line up.
  const sample = "flex h-4 w-6 shrink-0 items-center justify-center";
  return (
    <div
      className={`flex flex-wrap gap-x-3.5 gap-y-1 ${T.caption} ${TX.muted}`}
    >
      <span className={item}>
        {/* The finish line with a bar running out from it: the line is
            where the club is, the bar how far off a call was. */}
        <span aria-hidden className={`${sample} justify-start`}>
          <span className="h-4 w-px bg-ink" />
          <span className={`w-4 rounded-badge ${barClass(tone)}`} />
        </span>
        Shorter scores more
      </span>
      <span className={item}>
        <span aria-hidden className={sample}>
          <Mark tone={tone} hit size="size-4" />
        </span>
        Right Band
      </span>
      <span className={item}>
        {/* A no-points call in miniature: faded bar, lightly faded mark. */}
        <span aria-hidden className={sample}>
          <span className={`w-3 rounded-badge opacity-35 ${barClass(tone)}`} />
          <Mark tone={tone} className="-ml-1 opacity-60" />
        </span>
        No points
      </span>
      {showBoldCall ? (
        <span className={item}>
          <span aria-hidden className={sample}>
            <Star className={`size-3 fill-current ${TX.base}`} />
          </span>
          {BOLD_CALL_KEY}
        </span>
      ) : null}
      {showExactBand ? (
        <span className={item}>
          <span aria-hidden className={sample}>
            <span
              className={`flex items-center rounded-badge bg-success px-1 py-0.5 ${TX.onInk}`}
            >
              <Check className="size-3 stroke-[3]" />
            </span>
          </span>
          Exact Band
        </span>
      ) : null}
    </div>
  );
}

// --- Band headings ----------------------------------------------------------

/**
 * A Band section's heading: the /picks in-card week heading (Label, muted)
 * with the Band's wayfinding icon, as BandSummary carries it, and any
 * exact-Band chips on the right.
 */
export function BandHeading({
  bandIndex,
  label,
  chips,
}: {
  bandIndex: number;
  label: string;
  chips: React.ReactNode;
}) {
  const { Icon, positions } = BAND_META[TABLE_BANDS[bandIndex].key];
  return (
    <div
      className={`flex items-center gap-1.5 ${INSET} pt-2.5 pb-0.5 ${TX.muted}`}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className={`truncate ${LABEL}`}>{label}</span>
      <span className={`shrink-0 ${T.caption} font-medium tabular-nums`}>
        {positions}
      </span>
      {chips ? (
        <span className="ml-auto flex shrink-0 gap-1">{chips}</span>
      ) : null}
    </div>
  );
}

/**
 * An exact Band's bonus on its heading (#214 D12): Pitch Green as a fill
 * under paper text, carrying its owner's mark so it never relies on
 * position.
 */
export function BandBonusChip({
  tone,
  name,
  value,
}: {
  tone: Tone;
  name: string;
  value: number;
}) {
  if (value <= 0) return null;
  return (
    <span
      className={`flex items-center gap-1 rounded-badge bg-success py-0.5 pr-1.5 pl-1 ${MICRO_LABEL} tabular-nums ${TX.onInk}`}
    >
      <Mark tone={tone} size="size-2.5" />
      <Check className="-ml-0.5 size-3 stroke-[3]" aria-hidden />
      {pointLabel(value)}
      <span className="sr-only">
        {" "}
        for {name}: every club in this Band exactly right
      </span>
    </span>
  );
}

// --- The chart --------------------------------------------------------------

/** Hairlines at every Band boundary, so a bar's length can be counted. */
export function BandTicks() {
  return (
    <>
      {Array.from({ length: BAND_COUNT - 1 }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute inset-y-1 w-px bg-paper-line"
          style={{ left: pct(i + 1) }}
        />
      ))}
    </>
  );
}

/** The Band a club is in now (paper column) and its finish line. */
export function BandBackdrop({ actualBand }: { actualBand: number }) {
  return (
    <>
      <span
        className="absolute inset-y-0 bg-paper"
        style={{ left: pct(actualBand), width: pct(1) }}
      />
      <BandTicks />
      <span
        className="absolute inset-y-0 w-px bg-ink"
        style={{ left: centre(actualBand) }}
      />
    </>
  );
}

/** One player's call on a row: the bar to the finish line and the mark. */
export function Lane({
  call,
  actualBand,
  tone,
  top,
  notPlacedLabel,
}: {
  call: SideCall;
  actualBand: number;
  tone: Tone;
  top: string;
  /** "You: not placed", "Them: not placed", or the one-player wording. */
  notPlacedLabel: string;
}) {
  if (call.band === null) {
    return (
      <span
        className={`absolute left-0 -translate-y-1/2 ${T.label} font-bold ${TX.muted}`}
        style={{ top }}
      >
        {notPlacedLabel}
      </span>
    );
  }
  const from = Math.min(call.band, actualBand);
  const span = Math.abs(call.band - actualBand);
  // A call that scored no Placement points (too far out) is a bad tip, and
  // the whole call says so: the bar fades well back and the mark a little,
  // so it stays readable (#214 D14). Solid is a call that scored.
  const missed = span > 0 && call.placement === 0;
  return (
    <>
      {span > 0 ? (
        // Gold as a bar for your own call (DESIGN.md -> Trophy Gold, "a
        // fill, a bar, a ring"); anyone else's in the muted text role.
        <span
          aria-hidden
          className={`absolute -translate-y-1/2 rounded-badge ${barClass(tone)} ${
            missed ? "opacity-35" : ""
          }`}
          style={{ top, left: centre(from), width: pct(span) }}
        />
      ) : null}
      <Mark
        tone={tone}
        hit={span === 0}
        size={span === 0 ? "size-4" : "size-3.5"}
        className={`absolute -translate-x-1/2 -translate-y-1/2 ${missed ? "opacity-60" : ""}`}
        style={{ top, left: centre(call.band) }}
      />
      {call.boldCall ? (
        // In the last Band the star sits left of the mark, clear of the
        // points column.
        <Star
          aria-hidden
          className={`absolute size-3 -translate-y-1/2 fill-current ${TX.base} ${
            call.band === BAND_COUNT - 1 ? "-translate-x-5" : "translate-x-2.5"
          }`}
          style={{ top, left: centre(call.band) }}
        />
      ) : null}
    </>
  );
}

/** A call read aloud: "Right Band, +5, plus a Bold Call". */
export function rowSpeech(call: SideCall, actualBand: number): string {
  return `${distanceLabel(call, actualBand)}, ${pointLabel(call.placement)}${call.boldCall ? ", plus a Bold Call" : ""}`;
}

/**
 * A row's points: `+5` / `0` through pointLabel (DESIGN.md -> Do's), a Bold
 * Call folded in as `+8★` (#214 D10). The star slot is always reserved so
 * digits keep one column (DESIGN.md -> Steady Digits).
 */
export function PointsCell({
  call,
  className,
}: {
  call: SideCall;
  /** Weight and colour, decided by the caller. */
  className: string;
}) {
  return (
    <span
      className={`flex items-center justify-end gap-0.5 ${T.caption} tabular-nums ${className}`}
      aria-hidden
    >
      {pointLabel(call.points)}
      <span className="flex w-2.5 justify-center">
        {call.boldCall ? (
          <Star className="size-2.5 fill-current" aria-hidden />
        ) : null}
      </span>
    </span>
  );
}

export function LateChip() {
  // Neutral Teal is the Late Joiner badge role (DESIGN.md -> Neutral Teal).
  return (
    <span
      className={`shrink-0 rounded-badge bg-info px-1.5 py-0.5 ${MICRO_LABEL} ${TX.onInk}`}
    >
      Late
    </span>
  );
}

// --- Score parts and how they work ----------------------------------------

export interface Explainers {
  placement: string;
  bandBonus: string;
  boldCall: string;
  total: string;
}

const BAND_BONUS_AMOUNTS = (() => {
  // Bands grouped by bonus; the biggest group reads as "every other Band".
  const groups = [...new Set(SCORING_BANDS.map((band) => band.bonus))]
    .map((bonus) => ({
      bonus,
      names: SCORING_BANDS.filter((band) => band.bonus === bonus).map(
        (band) => band.name,
      ),
    }))
    .sort((a, b) => a.names.length - b.names.length);
  return groups
    .map((group, index) =>
      index === groups.length - 1
        ? `every other Band ${pointLabel(group.bonus)}`
        : `${group.names.join(", ")} ${pointLabel(group.bonus)}`,
    )
    .join(", ");
})();

const PLACEMENT_STEPS = PLACEMENT_POINTS_BY_DISTANCE.map((points, distance) =>
  distance === 0
    ? `right Band ${pointLabel(points)}`
    : `${String(distance)} Band${distance === 1 ? "" : "s"} away ${pointLabel(points)}`,
).join(", ");

/**
 * How each score part works, in /how-it-works' own words, with every number
 * read from src/lib/scoring -- never typed (PRODUCT.md). "you" for the
 * viewer's own table; "neutral" for someone else's table seen alone, where
 * second person would be wrong (#226 S5).
 */
export function scorePartExplainers(
  voice: "you" | "neutral",
  anyLateJoiner: boolean,
): Explainers {
  const you = voice === "you";
  const boldCall = `A right Band that no more than roughly one in ten players also called is a Bold Call, worth ${pointLabel(BOLD_CALL_BONUS)}. ${you ? "Your" : "The"} best ${String(MAX_BOLD_CALLS)} count.`;
  return {
    placement: `Each club scores for how close ${you ? "you put it" : "it was put"}: ${PLACEMENT_STEPS}, and any further scores 0.`,
    bandBonus: `Get every club in a Band right, in any order, for a bonus: ${BAND_BONUS_AMOUNTS}.`,
    boldCall: anyLateJoiner
      ? `${boldCall} Late Joiners can't earn Bold Calls.`
      : boldCall,
    total: `Placement, Band Bonus and Bold Calls added up. These points stay separate from ${you ? "your " : ""}weekly points.`,
  };
}

/**
 * One score part's row, with an info button that opens how it works in a
 * row beneath -- a tap, not a hover tooltip, for touch screens. One open at
 * a time (the caller holds which). `cells` are the players' figures, one
 * column each.
 */
export function ScorePartRows({
  label,
  max,
  total,
  explainer,
  open,
  onToggle,
  cells,
}: {
  label: string;
  max: number;
  total: boolean;
  explainer: string;
  open: boolean;
  onToggle: () => void;
  cells: { content: React.ReactNode; className: string }[];
}) {
  const panelId = useId();
  return (
    <>
      <tr className="border-t border-paper-line">
        <th
          scope="row"
          className={`py-1.5 text-left ${total ? `font-bold ${TX.base}` : `font-normal ${TX.muted}`}`}
        >
          <span className="inline-flex items-center">
            {label}
            <span
              className={`ml-1 ${T.caption} font-normal tabular-nums ${TX.muted}`}
            >
              /{max}
            </span>
            {/* A full 44px target, pulled into the row's height so the
                table doesn't grow (DESIGN.md -> 44px tap targets). */}
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls={panelId}
              aria-label={`How ${label} works`}
              className={`-my-3 grid size-11 place-items-center rounded-btn-sm ${open ? TX.base : TX.muted} hover:bg-ink/5 ${FOCUS}`}
            >
              <Info className="size-3.5" aria-hidden />
            </button>
          </span>
        </th>
        {cells.map((cell, index) => (
          <td key={index} className={`py-1.5 text-right ${cell.className}`}>
            {cell.content}
          </td>
        ))}
      </tr>
      {open ? (
        <tr id={panelId}>
          <td colSpan={cells.length + 1} className="pb-2">
            <p
              className={`rounded-btn-sm bg-paper px-3 py-2 ${T.caption} leading-snug ${TX.base}`}
            >
              {explainer}{" "}
              <Link
                href={"/how-it-works#predict-the-table" as Route}
                className={`font-bold underline underline-offset-2 ${FOCUS}`}
              >
                More in How it works
              </Link>
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}

// --- The tap card -------------------------------------------------------------

/**
 * The card a tapped row opens: docked above the tab bar with no scrim, so
 * the row stays visible above it, which it lifts clear of itself once its
 * real height is known. A raised sheet: Matchday Lift, no border
 * (DESIGN.md -> Elevation).
 */
export function DockedCard({
  teamId,
  name,
  shortCode,
  position,
  actualBand,
  seasonOver,
  onHeight,
  onClose,
  children,
}: {
  teamId: string;
  name: string;
  shortCode: string | null;
  position: number;
  actualBand: number;
  seasonOver: boolean;
  onHeight: (height: number) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const band = TABLE_BANDS[actualBand];
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current?.getBoundingClientRect();
    if (!card) return;
    onHeight(card.height);
    const tapped = document
      .getElementById(`row-${teamId}`)
      ?.getBoundingClientRect();
    if (!tapped) return;
    const overlap = tapped.bottom - (card.top - 8);
    if (overlap > 0) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
      window.scrollBy({
        top: overlap,
        behavior: reduce.matches ? "auto" : "smooth",
      });
    }
  }, [teamId, onHeight]);

  return (
    <div
      ref={cardRef}
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-4xl px-4"
      role="dialog"
      aria-label={`${name} details`}
    >
      <div className={`rounded-card bg-surface ${CARD_SHADOW}`}>
        <div className={`flex items-start gap-2 ${INSET} pt-3`}>
          <ClubCodeBadge shortCode={shortCode} fill={teamFill(shortCode)} />
          <div className="min-w-0 flex-1">
            <p className={`${T.body} font-bold leading-snug ${TX.base}`}>
              {name}
            </p>
            <p className={`${T.caption} ${TX.muted}`}>
              {seasonOver ? "Finished" : "Now"} {ordinal(position)} ·{" "}
              {band.label} Band
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`-mt-1.5 -mr-2 grid size-11 place-items-center rounded-btn-sm ${TX.muted} hover:bg-ink/5 ${FOCUS}`}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className={`flex flex-col gap-3 ${INSET} pt-3 pb-4`}>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The tapped row, enlarged: the same marks, bars, current-Band column and
 * ticks, labelled only at the Bands this card is about -- where the club is
 * now and each call.
 */
export function Ladder({
  actualBand,
  lanes,
}: {
  actualBand: number;
  lanes: { call: SideCall; tone: Tone; top: string; notPlacedLabel: string }[];
}) {
  const labelled = new Set<number | null>([
    actualBand,
    ...lanes.map((lane) => lane.call.band),
  ]);
  return (
    <div className="relative" aria-hidden>
      <span
        className="absolute inset-y-0 rounded-btn-sm bg-paper"
        style={{ left: pct(actualBand), width: pct(1) }}
      />
      <span className="relative block h-12">
        <BandTicks />
        <span
          className="absolute inset-y-1 w-px bg-ink"
          style={{ left: centre(actualBand) }}
        />
        {lanes.map((lane) => (
          <Lane key={lane.top} {...lane} actualBand={actualBand} />
        ))}
      </span>
      <span className="relative grid grid-cols-8 pb-1.5">
        {TABLE_BANDS.map((band, index) => (
          <span
            key={band.key}
            className={`whitespace-nowrap text-center ${T.label} tracking-[-0.04em] tabular-nums ${
              index === actualBand
                ? `font-extrabold ${TX.base}`
                : `font-bold ${TX.muted}`
            }`}
          >
            {labelled.has(index)
              ? BAND_META[band.key].positions.replace("-", "–")
              : null}
          </span>
        ))}
      </span>
    </div>
  );
}

/** One player's verdict on a club: whose, the points and how, the call. */
export function ScoreTile({
  name,
  tone,
  call,
  actualBand,
  pointsClass,
}: {
  name: string;
  tone: Tone;
  call: SideCall;
  actualBand: number;
  /** Weight and colour for the points, decided by the caller. */
  pointsClass: string;
}) {
  const placementPart = `${distanceLabel(call, actualBand)}${
    call.placement > 0 ? ` ${pointLabel(call.placement)}` : ""
  }`;
  return (
    // The leaderboard panel's Stat cell, scaled up: paper ground, the
    // non-interactive radius, no shadow (DESIGN.md -> Printed Controls).
    <div className="flex min-w-0 flex-col gap-1.5 rounded-btn-sm bg-paper px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-1.5">
        <Mark tone={tone} size="size-2.5" />
        <span className={`truncate ${MICRO_LABEL} ${TX.muted}`}>{name}</span>
      </span>
      <span className={`${T.h2} leading-none tabular-nums ${pointsClass}`}>
        {pointLabel(call.points)}
      </span>
      {/* The figure as one equation, so a Bold Call reads as part of the
          number above, never a second addition on top of it. */}
      <span className={`${T.caption} leading-snug ${TX.muted}`}>
        {placementPart}
        {call.boldCall ? (
          <span className={`font-bold ${TX.base}`}>
            {" · "}
            <Star
              className="mb-0.5 inline size-3 fill-current"
              aria-hidden
            />{" "}
            Bold Call +{BOLD_CALL_BONUS}
          </span>
        ) : null}
      </span>
      <span className={`${T.caption} font-bold leading-snug ${TX.base}`}>
        {call.band === null
          ? "Not placed"
          : `Said ${TABLE_BANDS[call.band].label}`}
      </span>
    </div>
  );
}
