"use client";

// G, the dumbbell view, for one player against the real table (issue #226):
// your own table scored on /predict-table, or another player's seen alone on
// /predict-table/[playerId] when you have no submitted table to compare.
// Drawn from the same pieces as the comparison (./chart-parts), so a mark,
// a bar, a Band heading or a tap card look identical in both. All numbers
// come from the tested `buildTableSingle` in src/lib/table-predictions.
//
// With one player there is nothing to compare: no gap sentence, and no
// bold-for-the-higher-figure (#214 D11 is moot). Everything else -- +8★,
// ticked hits, faded misses, exact-Band chips, now/finished -- carries over.

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { MAX_PREDICT_TABLE_SCORE } from "@/lib/scoring/predict-table";
import {
  MAX_BAND_BONUS,
  MAX_BOLD_CALLS_SCORE,
  MAX_PLACEMENT,
  type SingleRow,
  type TableSingle as TableSingleView,
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
  type Tone,
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

export interface SinglePlayer {
  displayName: string;
  emoji: string | null;
  isLateJoiner: boolean;
}

/** Nothing scored is muted; any points are plain -- there's no rival. */
function pointsClass(points: number): string {
  return points === 0 ? `font-medium ${TX.muted}` : `font-bold ${TX.base}`;
}

/** Row grid: club | 8-Band chart | points. */
const GRID = "grid-cols-[2.75rem_1fr_2rem]";

export function TableSingle({
  view,
  player,
  own,
  seasonOver,
  standingsNote,
  editHref,
}: {
  view: TableSingleView;
  player: SinglePlayer;
  /** The viewer's own table (gold, "you") or someone else's (outline,
   *  neutral wording) -- #226 S5. */
  own: boolean;
  seasonOver: boolean;
  /** Set when the standings are stale: the date they're measured against. */
  standingsNote: string | null;
  /** A Late Joiner's way back to the capture board (#226 S3). */
  editHref?: Route;
}) {
  const tone: Tone = own ? "own" : "peer";
  const name = own ? "You" : player.displayName;
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const openRow =
    view.sections.flatMap((s) => s.rows).find((r) => r.teamId === openTeamId) ??
    null;

  return (
    // While the docked card is open, pad by its measured height so the last
    // rows can still scroll out from under it.
    <div
      className="flex flex-col gap-4"
      style={openRow ? { paddingBottom: cardHeight + 16 } : undefined}
    >
      <Header view={view} player={player} own={own} editHref={editHref} />

      {standingsNote ? (
        <p className={`${T.caption} ${TX.muted}`}>
          Measured against the league table as of {standingsNote}.
        </p>
      ) : null}

      {/* A plain surface card, not CardShell: see TableCompare. */}
      <div className={`overflow-clip rounded-card bg-surface ${CARD_SHADOW}`}>
        <div
          className={`flex flex-col gap-1.5 border-b border-paper-line ${INSET} py-2.5`}
        >
          <span
            className={`flex min-w-0 items-center gap-1.5 ${T.caption} font-bold ${TX.base}`}
          >
            <Mark tone={tone} />
            <span className="truncate">{name}</span>
          </span>
          <KeySamples
            tone={tone}
            showBoldCall={view.sections.some((section) =>
              section.rows.some((row) => row.call.boldCall),
            )}
            showExactBand={view.sections.some(
              (section) => section.bandBonus > 0,
            )}
          />
        </div>
        <ol className="flex flex-col">
          {view.sections.map((section) => (
            <li
              key={section.bandIndex}
              className="border-t border-paper-line first:border-t-0"
            >
              <BandHeading
                bandIndex={section.bandIndex}
                label={section.label}
                chips={
                  section.bandBonus > 0 ? (
                    <BandBonusChip
                      tone={tone}
                      name={name}
                      value={section.bandBonus}
                    />
                  ) : null
                }
              />
              <ul>
                {section.rows.map((row) => (
                  <Row
                    key={row.teamId}
                    row={row}
                    tone={tone}
                    name={name}
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
          <p className="sr-only">
            {name}: {rowSpeech(openRow.call, openRow.actualBand)}.
          </p>
          <Ladder
            actualBand={openRow.actualBand}
            lanes={[
              {
                call: openRow.call,
                tone,
                top: "50%",
                notPlacedLabel: "Not placed",
              },
            ]}
          />
          <ScoreTile
            name={name}
            tone={tone}
            call={openRow.call}
            actualBand={openRow.actualBand}
            pointsClass={pointsClass(openRow.call.points)}
          />
        </DockedCard>
      ) : null}
    </div>
  );
}

function Header({
  view,
  player,
  own,
  editHref,
}: {
  view: TableSingleView;
  player: SinglePlayer;
  own: boolean;
  editHref?: Route;
}) {
  const totals = view.totals;
  const [openPart, setOpenPart] = useState<string | null>(null);
  const explainers = scorePartExplainers(
    own ? "you" : "neutral",
    player.isLateJoiner,
  );
  const parts: {
    key: string;
    label: string;
    max: number;
    value: number;
    explainer: string;
    total?: boolean;
  }[] = [
    {
      key: "placement",
      label: "Placement",
      max: MAX_PLACEMENT,
      value: totals.placement,
      explainer: explainers.placement,
    },
    {
      key: "bands",
      label: "Band Bonus",
      max: MAX_BAND_BONUS,
      value: totals.bandBonus,
      explainer: explainers.bandBonus,
    },
    {
      key: "bold",
      label: "Bold Calls",
      max: MAX_BOLD_CALLS_SCORE,
      value: totals.boldCalls,
      explainer: explainers.boldCall,
    },
    {
      key: "total",
      label: "Total",
      max: MAX_PREDICT_TABLE_SCORE,
      value: totals.total,
      explainer: explainers.total,
      total: true,
    },
  ];

  return (
    <CardShell className="bg-surface">
      {/* /picks/[playerId]'s ink identity band: whose table, and its total. */}
      <div className={`flex items-center gap-3 bg-ink ${INSET} py-3.5`}>
        <EmojiChip emoji={player.emoji} onDark />
        <span
          className={`flex min-w-0 flex-1 items-center gap-2 ${T.body} font-bold ${TX.onInk}`}
        >
          <span className="truncate">
            {own ? "Your table" : `${player.displayName}'s table`}
          </span>
          {player.isLateJoiner ? <LateChip /> : null}
        </span>
        <span className="flex shrink-0 items-baseline gap-0.5">
          <span
            className={`${T.score} font-extrabold leading-none tabular-nums ${TX.onInk}`}
          >
            {totals.total}
          </span>
          <span className={`${LABEL} tabular-nums ${TX.onInkMuted}`}>
            /{MAX_PREDICT_TABLE_SCORE}
          </span>
        </span>
      </div>

      <div className={`flex flex-col gap-3 ${INSET} py-4`}>
        <table className={`w-full ${T.dense} tabular-nums`}>
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
                      part.key === "bold" && player.isLateJoiner
                        ? "Not eligible"
                        : part.value,
                    className: part.total
                      ? `font-extrabold ${TX.base}`
                      : pointsClass(part.value),
                  },
                ]}
              />
            ))}
          </tbody>
        </table>

        <p className={`${T.caption} ${TX.muted}`}>
          <span className="font-bold">Exactly right Bands: </span>
          {totals.exactBands.length > 0
            ? `${totals.exactBands.join(", ")}.`
            : "none yet."}
        </p>

        {editHref ? <EditTableLink href={editHref} /> : null}
      </div>
    </CardShell>
  );
}

function Row({
  row,
  tone,
  name,
  seasonOver,
  open,
  onTap,
}: {
  row: SingleRow;
  tone: Tone;
  name: string;
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
          <ClubCodeBadge
            shortCode={row.shortCode}
            fill={teamFill(row.shortCode)}
          />
          <span className="sr-only">
            {row.name}, {seasonOver ? "finished" : "now"}{" "}
            {ordinal(row.position)}. {name}:{" "}
            {rowSpeech(row.call, row.actualBand)}.
          </span>
        </span>

        <span className="relative h-11" aria-hidden>
          <BandBackdrop actualBand={row.actualBand} />
          <Lane
            call={row.call}
            actualBand={row.actualBand}
            tone={tone}
            top="50%"
            notPlacedLabel="Not placed"
          />
        </span>

        <PointsCell call={row.call} className={pointsClass(row.call.points)} />
      </button>
    </li>
  );
}

/**
 * A Late Joiner's way back to the capture board (#226 S3): they can always
 * edit (CLAUDE.md). The small secondary button -- ink, not the accent,
 * which the gold marks already spend (DESIGN.md -> Buttons).
 */
export function EditTableLink({
  href = "/predict-table?edit=1" as Route,
}: {
  href?: Route;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-11 items-center justify-center rounded-btn bg-ink px-3.5 py-2 ${T.dense} font-bold ${TX.onInk} ${FOCUS}`}
    >
      Edit my table
    </Link>
  );
}
