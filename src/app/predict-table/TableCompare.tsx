"use client";

// G, the dumbbell view, comparing your Predict the Table entry with another
// player's against the real table (issue #214). The design, and every
// decision below, is settled in that issue: the prototype on branch
// predict-the-table-see-another-players-table-from is its reference
// rendering. All numbers come from the tested view-model in
// src/lib/table-predictions/compare.ts; this file only draws them.
//
// Built from the app's existing grammar (DESIGN.md): /picks/[playerId]'s
// ink identity band over a white body, the leaderboard's `n/200` totals,
// BandSummary's kit-coloured club badges and Band icons.

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Check, Info, Star, X } from "lucide-react";
import {
  BOLD_CALL_BONUS,
  MAX_BOLD_CALLS,
  MAX_PREDICT_TABLE_SCORE,
  PLACEMENT_POINTS_BY_DISTANCE,
  TABLE_BANDS as SCORING_BANDS,
} from "@/lib/scoring/predict-table";
import { TABLE_BANDS } from "@/lib/table-predictions/rules";
import {
  MAX_BAND_BONUS,
  MAX_BOLD_CALLS_SCORE,
  MAX_PLACEMENT,
  distanceLabel,
  gapSentence,
  leads,
  type ComparisonRow,
  type SideCall,
  type SideTotals,
  type TableComparison,
} from "@/lib/table-predictions/compare";
import { BAND_META, ordinal, teamFill } from "./shared";
import { EmojiChip } from "@/components/ui/PlayerChip";
import { CardShell } from "@/components/ui/CardShell";
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

export interface ComparePlayer {
  displayName: string;
  emoji: string | null;
  isLateJoiner: boolean;
}

const BAND_COUNT = TABLE_BANDS.length;
const BOLD_CALL_KEY = `Bold Call +${String(BOLD_CALL_BONUS)}`;

const pct = (n: number) => `${String((n * 100) / BAND_COUNT)}%`;
const centre = (band: number) => pct(band + 0.5);

/** The higher figure extrabold, the other plain, nothing scored muted (D11). */
function emphasis(mine: number, theirs: number): string {
  if (leads(mine, theirs)) return `font-extrabold ${TX.base}`;
  return mine === 0 ? `font-medium ${TX.muted}` : `font-medium ${TX.base}`;
}

export function TableCompare({
  comparison,
  you,
  them,
  seasonOver,
  standingsNote,
}: {
  comparison: TableComparison;
  you: ComparePlayer;
  them: ComparePlayer;
  seasonOver: boolean;
  /** Set when the standings are stale: the date they're measured against. */
  standingsNote: string | null;
}) {
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const openRow =
    comparison.sections
      .flatMap((s) => s.rows)
      .find((r) => r.teamId === openTeamId) ?? null;

  return (
    // While the docked card is open, pad by its measured height so the last
    // rows can still scroll out from under it.
    <div
      className="flex flex-col gap-4"
      style={openRow ? { paddingBottom: cardHeight + 16 } : undefined}
    >
      <Header comparison={comparison} you={you} them={them} />

      {standingsNote ? (
        <p className={`${T.caption} ${TX.muted}`}>
          Measured against the league table as of {standingsNote}.
        </p>
      ) : null}

      {/* A plain surface card, not CardShell: CardShell's overflow-hidden
          makes the card a scroll container, which pins the sticky marks to
          the card instead of the page. overflow-clip rounds the corners
          without that side effect. */}
      <div className={`overflow-clip rounded-card bg-surface ${CARD_SHADOW}`}>
        <ChartKey
          themName={them.displayName}
          showBoldCall={comparison.sections.some((section) =>
            section.rows.some((row) => row.you.boldCall || row.them.boldCall),
          )}
          showExactBand={comparison.sections.some(
            (section) => section.youBandBonus > 0 || section.themBandBonus > 0,
          )}
        />
        <StickyMarks />
        <ol className="flex flex-col">
          {comparison.sections.map((section) => {
            const band = TABLE_BANDS[section.bandIndex];
            const { Icon, positions } = BAND_META[band.key];
            return (
              <li
                key={section.bandIndex}
                className="border-t border-paper-line first:border-t-0"
              >
                {/* The /picks in-card week heading (Label, muted) with the
                    Band's wayfinding icon, as BandSummary carries it. */}
                <div
                  className={`flex items-center gap-1.5 ${INSET} pt-2.5 pb-0.5 ${TX.muted}`}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  <span className={`truncate ${LABEL}`}>{section.label}</span>
                  <span
                    className={`shrink-0 ${T.caption} font-medium tabular-nums`}
                  >
                    {positions}
                  </span>
                  {section.youBandBonus > 0 || section.themBandBonus > 0 ? (
                    <span className="ml-auto flex shrink-0 gap-1">
                      <BandBonusChip
                        who="you"
                        name="You"
                        value={section.youBandBonus}
                      />
                      <BandBonusChip
                        who="them"
                        name={them.displayName}
                        value={section.themBandBonus}
                      />
                    </span>
                  ) : null}
                </div>
                <ul>
                  {section.rows.map((row) => (
                    <Row
                      key={row.teamId}
                      row={row}
                      seasonOver={seasonOver}

                      open={row.teamId === openTeamId}
                      onTap={() =>
                        setOpenTeamId((id) =>
                          id === row.teamId ? null : row.teamId,
                        )
                      }
                    />
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>

      {openRow ? (
        <TapCard
          row={openRow}
          themName={them.displayName}
          seasonOver={seasonOver}

          onHeight={setCardHeight}
          onClose={() => setOpenTeamId(null)}
        />
      ) : null}
    </div>
  );
}

// --- Header ----------------------------------------------------------------

function Header({
  comparison,
  you,
  them,
}: {
  comparison: TableComparison;
  you: ComparePlayer;
  them: ComparePlayer;
}) {
  const youT = comparison.you;
  const themT = comparison.them;
  const [openPart, setOpenPart] = useState<string | null>(null);
  const anyLateJoiner = you.isLateJoiner || them.isLateJoiner;
  const parts: {
    key: string;
    label: string;
    max: number;
    you: number;
    them: number;
    explainer: string;
    total?: boolean;
  }[] = [
    {
      key: "placement",
      label: "Placement",
      max: MAX_PLACEMENT,
      you: youT.placement,
      them: themT.placement,
      explainer: PLACEMENT_EXPLAINER,
    },
    {
      key: "bands",
      label: "Band Bonus",
      max: MAX_BAND_BONUS,
      you: youT.bandBonus,
      them: themT.bandBonus,
      explainer: BAND_BONUS_EXPLAINER,
    },
    {
      key: "bold",
      label: "Bold Calls",
      max: MAX_BOLD_CALLS_SCORE,
      you: youT.boldCalls,
      them: themT.boldCalls,
      explainer: anyLateJoiner
        ? `${BOLD_CALL_EXPLAINER} Late Joiners can't earn Bold Calls.`
        : BOLD_CALL_EXPLAINER,
    },
    {
      key: "total",
      label: "Total",
      max: MAX_PREDICT_TABLE_SCORE,
      you: youT.total,
      them: themT.total,
      explainer: TOTAL_EXPLAINER,
      total: true,
    },
  ];

  // A Late Joiner sits outside the Bold Call process: the words, never a
  // dash (DESIGN.md -> Don'ts).
  const boldCell = (player: ComparePlayer, value: number) =>
    player.isLateJoiner ? "Not eligible" : String(value);

  return (
    <CardShell className="bg-surface">
      {/* /picks/[playerId]'s ink identity band, carrying both players. */}
      <div className={`grid grid-cols-2 gap-3 bg-ink ${INSET} py-3.5`}>
        <Who player={you} label="You" total={youT.total} />
        <Who
          player={them}
          label={them.displayName}
          total={themT.total}
          alignEnd
        />
      </div>

      <div className={`flex flex-col gap-3 ${INSET} py-4`}>
        <p
          className={`max-w-[52ch] ${T.body} font-bold leading-snug ${TX.base}`}
        >
          {gapSentence(them.displayName, youT.total, themT.total)}
        </p>

        <table className={`w-full ${T.dense} tabular-nums`}>
          <thead>
            <tr className={`${LABEL} ${TX.muted}`}>
              <th className="pb-1 text-left font-bold" scope="col">
                <span className="sr-only">Score part</span>
              </th>
              <th className="pb-1 text-right font-bold" scope="col">
                You
              </th>
              <th className="pb-1 text-right font-bold" scope="col">
                {them.displayName}
              </th>
            </tr>
          </thead>
          <tbody>
            {parts.map((part) => (
              <ScorePartRows
                key={part.key}
                label={part.label}
                max={part.max}
                total={part.total ?? false}
                explainer={part.explainer}
                open={openPart === part.key}
                onToggle={() =>
                  setOpenPart((current) =>
                    current === part.key ? null : part.key,
                  )
                }
                youCell={
                  part.key === "bold" ? boldCell(you, part.you) : part.you
                }
                themCell={
                  part.key === "bold" ? boldCell(them, part.them) : part.them
                }
                youClass={emphasis(part.you, part.them)}
                themClass={emphasis(part.them, part.you)}
              />
            ))}
          </tbody>
        </table>

        <p className={`${T.caption} ${TX.muted}`}>
          <span className="font-bold">Exactly right Bands: </span>
          {exactBandsLine(them.displayName, youT, themT)}
        </p>
      </div>
    </CardShell>
  );
}

// How each score part works, in /how-it-works' own words, with every number
// read from src/lib/scoring -- never typed (PRODUCT.md).
const PLACEMENT_EXPLAINER = `Each club scores for how close you put it: ${PLACEMENT_POINTS_BY_DISTANCE.map(
  (points, distance) =>
    distance === 0
      ? `right Band ${pointLabel(points)}`
      : `${String(distance)} Band${distance === 1 ? "" : "s"} away ${pointLabel(points)}`,
).join(", ")}, and any further scores 0.`;

const BAND_BONUS_EXPLAINER = (() => {
  // Bands grouped by bonus; the biggest group reads as "every other Band".
  const groups = [...new Set(SCORING_BANDS.map((band) => band.bonus))]
    .map((bonus) => ({
      bonus,
      names: SCORING_BANDS.filter((band) => band.bonus === bonus).map(
        (band) => band.name,
      ),
    }))
    .sort((a, b) => a.names.length - b.names.length);
  const amounts = groups.map((group, index) =>
    index === groups.length - 1
      ? `every other Band ${pointLabel(group.bonus)}`
      : `${group.names.join(", ")} ${pointLabel(group.bonus)}`,
  );
  return `Get every club in a Band right, in any order, for a bonus: ${amounts.join(", ")}.`;
})();

const BOLD_CALL_EXPLAINER = `A right Band that no more than roughly one in ten players also called is a Bold Call, worth ${pointLabel(BOLD_CALL_BONUS)}. Your best ${String(MAX_BOLD_CALLS)} count.`;

const TOTAL_EXPLAINER =
  "Placement, Band Bonus and Bold Calls added up. These points stay separate from your weekly points.";

/**
 * One score part's row, with an info button that opens how it works in a
 * row beneath -- a tap, not a hover tooltip, for touch screens. One open at
 * a time (the caller holds which).
 */
function ScorePartRows({
  label,
  max,
  total,
  explainer,
  open,
  onToggle,
  youCell,
  themCell,
  youClass,
  themClass,
}: {
  label: string;
  max: number;
  total: boolean;
  explainer: string;
  open: boolean;
  onToggle: () => void;
  youCell: React.ReactNode;
  themCell: React.ReactNode;
  youClass: string;
  themClass: string;
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
        <td className={`py-1.5 text-right ${youClass}`}>{youCell}</td>
        <td className={`py-1.5 text-right ${themClass}`}>{themCell}</td>
      </tr>
      {open ? (
        <tr id={panelId}>
          <td colSpan={3} className="pb-2">
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

function exactBandsLine(
  themName: string,
  you: SideTotals,
  them: SideTotals,
): string {
  if (you.exactBands.length === 0 && them.exactBands.length === 0) {
    return "none yet for either of you.";
  }
  const list = (bands: string[]) =>
    bands.length > 0 ? bands.join(", ") : "none yet";
  return `you, ${list(you.exactBands)}. ${themName}, ${list(them.exactBands)}.`;
}

function LateChip() {
  // Neutral Teal is the Late Joiner badge role (DESIGN.md -> Neutral Teal).
  return (
    <span
      className={`shrink-0 rounded-badge bg-info px-1.5 py-0.5 ${MICRO_LABEL} ${TX.onInk}`}
    >
      Late
    </span>
  );
}

function Who({
  player,
  label,
  total,
  alignEnd,
}: {
  player: ComparePlayer;
  label: string;
  total: number;
  alignEnd?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 ${alignEnd ? "items-end text-right" : ""}`}
    >
      <div
        className={`flex min-w-0 items-center gap-2 ${alignEnd ? "flex-row-reverse" : ""}`}
      >
        <EmojiChip emoji={player.emoji} onDark />
        <span className={`min-w-0 truncate ${T.body} font-bold ${TX.onInk}`}>
          {label}
        </span>
        {player.isLateJoiner ? <LateChip /> : null}
      </div>
      {/* The leaderboard's `n/200`, at Display size like /picks' total. */}
      <span className="flex items-baseline gap-0.5">
        <span
          className={`${T.score} font-extrabold leading-none tabular-nums ${TX.onInk}`}
        >
          {total}
        </span>
        <span className={`${LABEL} tabular-nums ${TX.onInkMuted}`}>
          /{MAX_PREDICT_TABLE_SCORE}
        </span>
      </span>
    </div>
  );
}

// --- Marks, key and sticky header -------------------------------------------

// The chart's marks, drawn once so the lanes, the key, the sticky header,
// the chips and the tiles all use the exact same shapes -- never a glyph
// standing in for them. Your mark is Trophy Gold (DESIGN.md -> Accent
// Budget Rule, issue #214); theirs is outline ink, never Neutral Teal.
function Mark({
  who,
  hit = false,
  size = "size-3",
  className = "",
  style,
}: {
  who: "you" | "them";
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
        who === "you"
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

/**
 * What each mark means, in the role /picks' PicksLegend plays. Two tiers:
 * who (the two marks), then how to read the chart -- one quiet row of
 * same-sized samples with short labels. Entries for things that aren't on
 * this chart (no Bold Call, no exact Band) are left out.
 */
function ChartKey({
  themName,
  showBoldCall,
  showExactBand,
}: {
  themName: string;
  showBoldCall: boolean;
  showExactBand: boolean;
}) {
  const item = "flex items-center gap-1.5";
  // Every sample sits in the same box, so the labels line up.
  const sample = "flex h-4 w-6 shrink-0 items-center justify-center";
  return (
    <div
      className={`flex flex-col gap-1.5 border-b border-paper-line ${INSET} py-2.5`}
    >
      <div
        className={`flex flex-wrap gap-x-4 ${T.caption} font-bold ${TX.base}`}
      >
        <span className={item}>
          <Mark who="you" />
          You
        </span>
        <span className={`${item} min-w-0`}>
          <Mark who="them" />
          <span className="truncate">{themName}</span>
        </span>
      </div>
      <div
        className={`flex flex-wrap gap-x-3.5 gap-y-1 ${T.caption} ${TX.muted}`}
      >
        <span className={item}>
          {/* The finish line with a bar running out from it: the line is
              where the club is, the bar how far off a call was. */}
          <span aria-hidden className={`${sample} justify-start`}>
            <span className="h-4 w-px bg-ink" />
            <span className="h-1.5 w-4 rounded-badge bg-accent" />
          </span>
          Shorter scores more
        </span>
        <span className={item}>
          <span aria-hidden className={sample}>
            <Mark who="you" hit size="size-4" />
          </span>
          Right Band
        </span>
        <span className={item}>
          {/* A no-points call in miniature: faded bar, lightly faded mark. */}
          <span aria-hidden className={sample}>
            <span className="h-1.5 w-3 rounded-badge bg-accent opacity-35" />
            <Mark who="you" className="-ml-1 opacity-60" />
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
    </div>
  );
}

/** Row grid: club | 8-Band chart | You | Them. */
const GRID = "grid-cols-[2.75rem_1fr_2rem_2rem]";

/**
 * Sticky once the key scrolls away: heads each points column with its
 * player's mark. No Band labels on the axis (prototype Q11) -- each
 * section's heading and its shaded column name the Band.
 */
function StickyMarks() {
  return (
    <div
      className={`sticky top-0 z-10 grid ${GRID} items-end gap-1.5 border-b border-paper-line bg-surface ${INSET} py-1.5`}
    >
      <span aria-hidden />
      <span aria-hidden />
      <span className="flex justify-end pr-3">
        <Mark who="you" size="size-2.5" />
        <span className="sr-only">You</span>
      </span>
      <span className="flex justify-end pr-3">
        <Mark who="them" size="size-2.5" />
        <span className="sr-only">Them</span>
      </span>
    </div>
  );
}

/**
 * An exact Band's bonus on its heading (D12): Pitch Green as a fill under
 * paper text, carrying its owner's mark so it never relies on position.
 */
function BandBonusChip({
  who,
  name,
  value,
}: {
  who: "you" | "them";
  name: string;
  value: number;
}) {
  if (value <= 0) return null;
  return (
    <span
      className={`flex items-center gap-1 rounded-badge bg-success py-0.5 pr-1.5 pl-1 ${MICRO_LABEL} tabular-nums ${TX.onInk}`}
    >
      <Mark who={who} size="size-2.5" />
      <Check className="-ml-0.5 size-3 stroke-[3]" aria-hidden />
      {pointLabel(value)}
      <span className="sr-only">
        {" "}
        for {name}: every club in this Band exactly right
      </span>
    </span>
  );
}

// --- The chart ---------------------------------------------------------------

/** Hairlines at every Band boundary, so a bar's length can be counted. */
function BandTicks() {
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

function Lane({
  call,
  actualBand,
  who,
  top,
}: {
  call: SideCall;
  actualBand: number;
  who: "you" | "them";
  top: string;
}) {
  const you = who === "you";
  if (call.band === null) {
    return (
      <span
        className={`absolute left-0 -translate-y-1/2 ${T.label} font-bold ${TX.muted}`}
        style={{ top }}
      >
        {you ? "You" : "Them"}: not placed
      </span>
    );
  }
  const from = Math.min(call.band, actualBand);
  const span = Math.abs(call.band - actualBand);
  // A call that scored no Placement points (too far out) is a bad tip, and
  // the whole call says so: the bar fades well back and the mark a little,
  // so it stays readable (issue #214). Solid gold is a call that scored.
  const missed = span > 0 && call.placement === 0;
  return (
    <>
      {span > 0 ? (
        // Gold as a bar for your own call (DESIGN.md -> Trophy Gold, "a
        // fill, a bar, a ring"); the peer's bar in the muted text role.
        <span
          aria-hidden
          className={`absolute -translate-y-1/2 rounded-badge ${
            you ? "h-1.5 bg-accent" : "h-0.5 bg-text-muted"
          } ${missed ? "opacity-35" : ""}`}
          style={{ top, left: centre(from), width: pct(span) }}
        />
      ) : null}
      <Mark
        who={who}
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

function rowSpeech(call: SideCall, actualBand: number): string {
  return `${distanceLabel(call, actualBand)}, ${pointLabel(call.placement)}${call.boldCall ? ", plus a Bold Call" : ""}`;
}

function Row({
  row,
  seasonOver,
  open,
  onTap,
}: {
  row: ComparisonRow;
  seasonOver: boolean;
  open: boolean;
  onTap: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        id={`row-${row.teamId}`}
        onClick={onTap}
        aria-expanded={open}
        className={`grid min-h-11 w-full ${GRID} items-center gap-1.5 ${INSET} text-left ${open ? "bg-paper" : "hover:bg-paper/60"} ${FOCUS}`}
      >
        <span className="flex min-w-0 items-center">
          {/* BandSummary's club identity: the code on its kit colour, run
              through the contrast floor (DESIGN.md -> Kit Colour Rule). */}
          <ClubCodeBadge
            shortCode={row.shortCode}
            fill={teamFill(row.shortCode)}
          />
          <span className="sr-only">
            {row.name}, {seasonOver ? "finished" : "now"}{" "}
            {ordinal(row.position)}. You {rowSpeech(row.you, row.actualBand)}.
            Them {rowSpeech(row.them, row.actualBand)}.
          </span>
        </span>

        <span className="relative h-11" aria-hidden>
          <span
            className="absolute inset-y-0 bg-paper"
            style={{ left: pct(row.actualBand), width: pct(1) }}
          />
          <BandTicks />
          <span
            className="absolute inset-y-0 w-px bg-ink"
            style={{ left: centre(row.actualBand) }}
          />
          <Lane
            call={row.you}
            actualBand={row.actualBand}
            who="you"
            top="34%"
          />
          <Lane
            call={row.them}
            actualBand={row.actualBand}
            who="them"
            top="68%"
          />
        </span>

        <PointsCell call={row.you} theirs={row.them.points} />
        <PointsCell call={row.them} theirs={row.you.points} />
      </button>
    </li>
  );
}

function PointsCell({ call, theirs }: { call: SideCall; theirs: number }) {
  return (
    // `+5` / `0` through pointLabel (DESIGN.md -> Do's); a Bold Call folded
    // in as `+8★` (D10). The star slot is always reserved so digits keep
    // one column (DESIGN.md -> Steady Digits).
    <span
      className={`flex items-center justify-end gap-0.5 ${T.caption} tabular-nums ${emphasis(call.points, theirs)}`}
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

// --- The tap card ------------------------------------------------------------

function TapCard({
  row,
  themName,
  seasonOver,
  onHeight,
  onClose,
}: {
  row: ComparisonRow;
  themName: string;
  seasonOver: boolean;
  onHeight: (height: number) => void;
  onClose: () => void;
}) {
  const band = TABLE_BANDS[row.actualBand];
  const cardRef = useRef<HTMLDivElement>(null);

  // Keep the tapped row visible above the docked card: once the card has
  // rendered (its height varies with its content), lift the row clear of it
  // if it landed underneath.
  useEffect(() => {
    const card = cardRef.current?.getBoundingClientRect();
    if (!card) return;
    onHeight(card.height);
    const tapped = document
      .getElementById(`row-${row.teamId}`)
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
  }, [row.teamId, onHeight]);

  return (
    // Docked above the tab bar, no scrim, so the row stays visible above
    // it. A raised sheet: Matchday Lift, no border (DESIGN.md -> Elevation).
    <div
      ref={cardRef}
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-4xl px-4"
      role="dialog"
      aria-label={`${row.name} details`}
    >
      <div className={`rounded-card bg-surface ${CARD_SHADOW}`}>
        <div className={`flex items-start gap-2 ${INSET} pt-3`}>
          <ClubCodeBadge
            shortCode={row.shortCode}
            fill={teamFill(row.shortCode)}
          />
          <div className="min-w-0 flex-1">
            <p className={`${T.body} font-bold leading-snug ${TX.base}`}>
              {row.name}
            </p>
            <p className={`${T.caption} ${TX.muted}`}>
              {seasonOver ? "Finished" : "Now"} {ordinal(row.position)} ·{" "}
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
          {/* WHERE each call landed is the ladder, HOW MUCH it scored is
              the tiles. The prose is for screen readers. */}
          <p className="sr-only">
            You: {rowSpeech(row.you, row.actualBand)}. {themName}:{" "}
            {rowSpeech(row.them, row.actualBand)}.
          </p>
          <Ladder row={row} />
          <div className="grid grid-cols-2 gap-2">
            <ScoreTile
              name="You"
              who="you"
              call={row.you}
              actualBand={row.actualBand}
              theirs={row.them.points}
            />
            <ScoreTile
              name={themName}
              who="them"
              call={row.them}
              actualBand={row.actualBand}
              theirs={row.you.points}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The tapped row, enlarged: the same marks, bars, current-Band column and
 * ticks, labelled only at the Bands this card is about -- where the club is
 * now and the two calls.
 */
function Ladder({ row }: { row: ComparisonRow }) {
  const labelled = new Set([row.actualBand, row.you.band, row.them.band]);
  return (
    <div className="relative" aria-hidden>
      <span
        className="absolute inset-y-0 rounded-btn-sm bg-paper"
        style={{ left: pct(row.actualBand), width: pct(1) }}
      />
      <span className="relative block h-12">
        <BandTicks />
        <span
          className="absolute inset-y-1 w-px bg-ink"
          style={{ left: centre(row.actualBand) }}
        />
        <Lane call={row.you} actualBand={row.actualBand} who="you" top="32%" />
        <Lane
          call={row.them}
          actualBand={row.actualBand}
          who="them"
          top="70%"
        />
      </span>
      <span className="relative grid grid-cols-8 pb-1.5">
        {TABLE_BANDS.map((band, index) => (
          <span
            key={band.key}
            className={`whitespace-nowrap text-center ${T.label} tracking-[-0.04em] tabular-nums ${
              index === row.actualBand
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

/** One player's verdict on this club: whose, the points and how, the call. */
function ScoreTile({
  name,
  who,
  call,
  actualBand,
  theirs,
}: {
  name: string;
  who: "you" | "them";
  call: SideCall;
  actualBand: number;
  theirs: number;
}) {
  const placementPart = `${distanceLabel(call, actualBand)}${
    call.placement > 0 ? ` ${pointLabel(call.placement)}` : ""
  }`;
  return (
    // The leaderboard panel's Stat cell, scaled up: paper ground, the
    // non-interactive radius, no shadow (DESIGN.md -> Printed Controls).
    <div className="flex min-w-0 flex-col gap-1.5 rounded-btn-sm bg-paper px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-1.5">
        <Mark who={who} size="size-2.5" />
        <span className={`truncate ${MICRO_LABEL} ${TX.muted}`}>{name}</span>
      </span>
      <span
        className={`${T.h2} leading-none tabular-nums ${emphasis(call.points, theirs)}`}
      >
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
