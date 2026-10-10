"use client";

// G, the dumbbell view, comparing your Predict the Table entry with another
// player's against the real table (issue #214). The design, and every
// decision below, is settled in that issue: the prototype on branch
// predict-the-table-see-another-players-table-from is its reference
// rendering. All numbers come from the tested view-model in
// src/lib/table-predictions/compare.ts; this file only draws them.
//
// The drawing pieces it shares with the one-player view (TableSingle, issue
// #226) live in ./chart-parts; what stays here is what's genuinely about two
// players -- the two-player header, the two lanes and two points columns,
// and the bold-for-the-higher-figure rule (D11).
//
// Built from the app's existing grammar (DESIGN.md): /picks/[playerId]'s
// ink identity band over a white body, the leaderboard's `n/200` totals,
// BandSummary's kit-coloured club badges and Band icons.

import { useState } from "react";
import { MAX_PREDICT_TABLE_SCORE } from "@/lib/scoring/predict-table";
import {
  MAX_BAND_BONUS,
  MAX_BOLD_CALLS_SCORE,
  MAX_PLACEMENT,
  gapSentence,
  leads,
  type ComparisonRow,
  type SideTotals,
  type TableComparison,
} from "@/lib/table-predictions/compare";
import { ordinal, teamFill } from "./shared";
import {
  BandBackdrop,
  BandBonusChip,
  BandHeading,
  DockedCard,
  KeySamples,
  Ladder,
  Lane,
  LateChip,
  Mark,
  PointsCell,
  ScorePartRows,
  ScoreTile,
  rowSpeech,
  scorePartExplainers,
} from "./chart-parts";
import { EmojiChip } from "@/components/ui/PlayerChip";
import { CardShell } from "@/components/ui/CardShell";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import {
  CARD_SHADOW,
  FOCUS,
  INSET,
  LABEL,
  T,
  TX,
} from "@/components/ui/tokens";

export interface ComparePlayer {
  displayName: string;
  emoji: string | null;
  isLateJoiner: boolean;
}

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
        <div
          className={`flex flex-col gap-1.5 border-b border-paper-line ${INSET} py-2.5`}
        >
          {/* The key's first tier: who, by their marks. */}
          <div
            className={`flex flex-wrap gap-x-4 ${T.caption} font-bold ${TX.base}`}
          >
            <span className="flex items-center gap-1.5">
              <Mark tone="own" />
              You
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Mark tone="peer" />
              <span className="truncate">{them.displayName}</span>
            </span>
          </div>
          <KeySamples
            tone="own"
            showBoldCall={comparison.sections.some((section) =>
              section.rows.some((row) => row.you.boldCall || row.them.boldCall),
            )}
            showExactBand={comparison.sections.some(
              (section) =>
                section.youBandBonus > 0 || section.themBandBonus > 0,
            )}
          />
        </div>
        <StickyMarks />
        <ol className="flex flex-col">
          {comparison.sections.map((section) => (
            <li
              key={section.bandIndex}
              className="border-t border-paper-line first:border-t-0"
            >
              <BandHeading
                bandIndex={section.bandIndex}
                label={section.label}
                chips={
                  section.youBandBonus > 0 || section.themBandBonus > 0 ? (
                    <>
                      <BandBonusChip
                        tone="own"
                        name="You"
                        value={section.youBandBonus}
                      />
                      <BandBonusChip
                        tone="peer"
                        name={them.displayName}
                        value={section.themBandBonus}
                      />
                    </>
                  ) : null
                }
              />
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
          ))}
        </ol>
      </div>

      {openRow ? (
        <DockedCard
          teamId={openRow.teamId}
          name={openRow.name}
          shortCode={openRow.shortCode}
          position={openRow.position}
          actualBand={openRow.actualBand}
          seasonOver={seasonOver}
          onHeight={setCardHeight}
          onClose={() => setOpenTeamId(null)}
        >
          {/* WHERE each call landed is the ladder, HOW MUCH it scored is
              the tiles. The prose is for screen readers. */}
          <p className="sr-only">
            You: {rowSpeech(openRow.you, openRow.actualBand)}.{" "}
            {them.displayName}: {rowSpeech(openRow.them, openRow.actualBand)}.
          </p>
          <Ladder
            actualBand={openRow.actualBand}
            lanes={[
              {
                call: openRow.you,
                tone: "own",
                top: "32%",
                notPlacedLabel: "You: not placed",
              },
              {
                call: openRow.them,
                tone: "peer",
                top: "70%",
                notPlacedLabel: "Them: not placed",
              },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <ScoreTile
              name="You"
              tone="own"
              call={openRow.you}
              actualBand={openRow.actualBand}
              pointsClass={emphasis(openRow.you.points, openRow.them.points)}
            />
            <ScoreTile
              name={them.displayName}
              tone="peer"
              call={openRow.them}
              actualBand={openRow.actualBand}
              pointsClass={emphasis(openRow.them.points, openRow.you.points)}
            />
          </div>
        </DockedCard>
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
  const explainers = scorePartExplainers(
    "you",
    you.isLateJoiner || them.isLateJoiner,
  );

  // A Late Joiner sits outside the Bold Call process: the words, never a
  // dash (DESIGN.md -> Don'ts).
  const boldCell = (player: ComparePlayer, value: number) =>
    player.isLateJoiner ? "Not eligible" : String(value);

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
      explainer: explainers.placement,
    },
    {
      key: "bands",
      label: "Band Bonus",
      max: MAX_BAND_BONUS,
      you: youT.bandBonus,
      them: themT.bandBonus,
      explainer: explainers.bandBonus,
    },
    {
      key: "bold",
      label: "Bold Calls",
      max: MAX_BOLD_CALLS_SCORE,
      you: youT.boldCalls,
      them: themT.boldCalls,
      explainer: explainers.boldCall,
    },
    {
      key: "total",
      label: "Total",
      max: MAX_PREDICT_TABLE_SCORE,
      you: youT.total,
      them: themT.total,
      explainer: explainers.total,
      total: true,
    },
  ];

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
                cells={[
                  {
                    content:
                      part.key === "bold" ? boldCell(you, part.you) : part.you,
                    className: emphasis(part.you, part.them),
                  },
                  {
                    content:
                      part.key === "bold"
                        ? boldCell(them, part.them)
                        : part.them,
                    className: emphasis(part.them, part.you),
                  },
                ]}
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

// --- The chart: two lanes, two points columns --------------------------------

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
        <Mark tone="own" size="size-2.5" />
        <span className="sr-only">You</span>
      </span>
      <span className="flex justify-end pr-3">
        <Mark tone="peer" size="size-2.5" />
        <span className="sr-only">Them</span>
      </span>
    </div>
  );
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
          <BandBackdrop actualBand={row.actualBand} />
          <Lane
            call={row.you}
            actualBand={row.actualBand}
            tone="own"
            top="34%"
            notPlacedLabel="You: not placed"
          />
          <Lane
            call={row.them}
            actualBand={row.actualBand}
            tone="peer"
            top="68%"
            notPlacedLabel="Them: not placed"
          />
        </span>

        <PointsCell
          call={row.you}
          className={emphasis(row.you.points, row.them.points)}
        />
        <PointsCell
          call={row.them}
          className={emphasis(row.them.points, row.you.points)}
        />
      </button>
    </li>
  );
}
