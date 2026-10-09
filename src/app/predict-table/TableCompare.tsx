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

import { useEffect, useRef, useState } from "react";
import { Check, Star, X } from "lucide-react";
import {
  BOLD_CALL_BONUS,
  MAX_PREDICT_TABLE_SCORE,
} from "@/lib/scoring/predict-table";
import { TABLE_BANDS } from "@/lib/table-predictions/rules";
import {
  MAX_BAND_BONUS,
  MAX_BOLD_CALLS_SCORE,
  MAX_PLACEMENT,
  SCORING_REACH,
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

/** How a call that scored no Placement points is drawn (TEMPORARY choice). */
export type MissStyle = "faded" | "dashed";

export interface ComparePlayer {
  displayName: string;
  emoji: string | null;
  isLateJoiner: boolean;
}

const BAND_COUNT = TABLE_BANDS.length;
const BOLD_CALL_KEY = `+${String(BOLD_CALL_BONUS)} Bold Call`;

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
  miss,
}: {
  comparison: TableComparison;
  you: ComparePlayer;
  them: ComparePlayer;
  seasonOver: boolean;
  /**
   * TEMPORARY (issue #214 before/after): how a no-points call's bar is
   * drawn. Remove the prop and keep the chosen style before merge.
   */
  miss: MissStyle;
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
          seasonOver={seasonOver}
          miss={miss}
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
                      miss={miss}
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
          miss={miss}
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
  const parts: {
    key: string;
    label: string;
    max: number;
    you: number;
    them: number;
  }[] = [
    {
      key: "placement",
      label: "Placement",
      max: MAX_PLACEMENT,
      you: youT.placement,
      them: themT.placement,
    },
    {
      key: "bands",
      label: "Band Bonus",
      max: MAX_BAND_BONUS,
      you: youT.bandBonus,
      them: themT.bandBonus,
    },
    {
      key: "bold",
      label: "Bold Calls",
      max: MAX_BOLD_CALLS_SCORE,
      you: youT.boldCalls,
      them: themT.boldCalls,
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
              <tr key={part.key} className="border-t border-paper-line">
                <th
                  scope="row"
                  className={`py-1.5 text-left font-normal ${TX.muted}`}
                >
                  {part.label}
                  <span className={`ml-1 ${T.caption} tabular-nums`}>
                    /{part.max}
                  </span>
                </th>
                <td
                  className={`py-1.5 text-right ${emphasis(part.you, part.them)}`}
                >
                  {part.key === "bold" ? boldCell(you, part.you) : part.you}
                </td>
                <td
                  className={`py-1.5 text-right ${emphasis(part.them, part.you)}`}
                >
                  {part.key === "bold" ? boldCell(them, part.them) : part.them}
                </td>
              </tr>
            ))}
            <tr className="border-t border-paper-line">
              <th
                scope="row"
                className={`py-1.5 text-left font-bold ${TX.base}`}
              >
                Total
                <span
                  className={`ml-1 ${T.caption} font-normal tabular-nums ${TX.muted}`}
                >
                  /{MAX_PREDICT_TABLE_SCORE}
                </span>
              </th>
              <td
                className={`py-1.5 text-right ${emphasis(youT.total, themT.total)}`}
              >
                {youT.total}
              </td>
              <td
                className={`py-1.5 text-right ${emphasis(themT.total, youT.total)}`}
              >
                {themT.total}
              </td>
            </tr>
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

/** What each mark means, in the role /picks' PicksLegend plays. */
function ChartKey({
  themName,
  seasonOver,
  miss,
}: {
  themName: string;
  seasonOver: boolean;
  miss: MissStyle;
}) {
  const item = "flex items-center gap-1.5";
  return (
    <div
      className={`flex flex-wrap gap-x-4 gap-y-1.5 border-b border-paper-line ${INSET} py-2.5 ${T.caption} ${TX.muted}`}
    >
      <span className={item}>
        <Mark who="you" />
        <span className={`font-bold ${TX.base}`}>You</span>
      </span>
      <span className={item}>
        <Mark who="them" />
        <span className={`font-bold ${TX.base}`}>{themName}</span>
      </span>
      <span className={item}>
        <span aria-hidden className="h-1.5 w-5 rounded-badge bg-accent" />
        How far off: shorter scores more
      </span>
      <span className={item}>
        <Mark who="you" hit size="size-4" />
        Right Band
      </span>
      <span className={item}>
        <span
          aria-hidden
          className={`h-1.5 w-5 ${miss === "faded" ? "rounded-badge bg-accent opacity-35" : ""}`}
          style={
            miss === "dashed"
              ? {
                  backgroundImage:
                    "repeating-linear-gradient(90deg, var(--color-accent) 0 4px, transparent 4px 7px)",
                }
              : undefined
          }
        />
        {`No points: ${String(SCORING_REACH + 1)}+ Bands out`}
      </span>
      <span className={item}>
        {/* The current-Band column and its finish line, in miniature. */}
        <span
          aria-hidden
          className="relative flex h-4 w-3 justify-center bg-paper"
        >
          <span className="h-full w-px bg-ink" />
        </span>
        {seasonOver ? "Where it finished" : "Where it is now"}
      </span>
      <span className={item}>
        <Star className={`size-3 fill-current ${TX.base}`} aria-hidden />
        {BOLD_CALL_KEY}
      </span>
      <span className={item}>
        <span
          aria-hidden
          className={`flex items-center rounded-badge bg-success px-1 py-0.5 ${TX.onInk}`}
        >
          <Check className="size-3 stroke-[3]" />
        </span>
        Band exactly right
      </span>
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
  miss,
}: {
  call: SideCall;
  actualBand: number;
  who: "you" | "them";
  top: string;
  /** How a call that scored no Placement points is drawn. */
  miss: MissStyle;
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
  // the whole bar says so: faded, or dashed (issue #214, the owner's
  // before/after). A solid bar is a call that scored.
  const missed = span > 0 && call.placement === 0;
  const colour = you ? "var(--color-accent)" : "var(--color-text-muted)";
  return (
    <>
      {span > 0 ? (
        // Gold as a bar for your own call (DESIGN.md -> Trophy Gold, "a
        // fill, a bar, a ring"); the peer's bar in the muted text role.
        <span
          aria-hidden
          className={`absolute -translate-y-1/2 ${you ? "h-1.5" : "h-0.5"} ${
            missed && miss === "faded" ? "opacity-35" : ""
          } ${missed && miss === "dashed" ? "" : "rounded-badge"}`}
          style={{
            top,
            left: centre(from),
            width: pct(span),
            ...(missed && miss === "dashed"
              ? {
                  backgroundImage: `repeating-linear-gradient(90deg, ${colour} 0 4px, transparent 4px 7px)`,
                }
              : { background: colour }),
          }}
        />
      ) : null}
      <Mark
        who={who}
        hit={span === 0}
        size={span === 0 ? "size-4" : "size-3.5"}
        className="absolute -translate-x-1/2 -translate-y-1/2"
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
  miss,
  open,
  onTap,
}: {
  row: ComparisonRow;
  seasonOver: boolean;
  miss: MissStyle;
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
            miss={miss}
          />
          <Lane
            call={row.them}
            actualBand={row.actualBand}
            who="them"
            top="68%"
            miss={miss}
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
  miss,
  onHeight,
  onClose,
}: {
  row: ComparisonRow;
  themName: string;
  seasonOver: boolean;
  miss: MissStyle;
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
          <Ladder row={row} miss={miss} />
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
function Ladder({ row, miss }: { row: ComparisonRow; miss: MissStyle }) {
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
        <Lane
          call={row.you}
          actualBand={row.actualBand}
          who="you"
          top="32%"
          miss={miss}
        />
        <Lane
          call={row.them}
          actualBand={row.actualBand}
          who="them"
          top="70%"
          miss={miss}
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
