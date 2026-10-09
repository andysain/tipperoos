"use client";

// PROTOTYPE -- issue #214. G, the dumbbell view, in comparison mode, with
// each of the issue's open questions as a switchable option. Throwaway: no
// tests, minimal error handling, and it never ships to Production.
//
// Built from the app's existing grammar rather than its own (DESIGN.md):
// the /picks/[playerId] page shape (back-link, Headline, ink identity band
// over a white body), the leaderboard's `n/200` totals and component names,
// BandSummary's kit-coloured club badges and Band icons, and the /picks
// in-card week heading for the Band sections.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Star, X } from "lucide-react";
import {
  MAX_PREDICT_TABLE_SCORE,
  type PredictTableScoreResult,
} from "@/lib/scoring/predict-table";
import { TABLE_BANDS } from "@/lib/table-predictions/rules";
import { BAND_META, ordinal, teamFill } from "@/app/predict-table/shared";
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
import type { ProtoPlayer, ProtoTeam } from "./data";
import {
  BOLD_CALL_LINE,
  BOLD_CALL_SHORT,
  buildSections,
  headerSentence,
  placementReason,
  totals,
  type CompareRow,
  type SentenceRule,
  type SideCall,
  type SideTotals,
} from "./view";
import { ProtoPanel, OPTION_DEFAULTS, type Options } from "./ProtoPanel";

export interface ProtoPayload {
  viewerId: string;
  players: ProtoPlayer[];
  teams: ProtoTeam[];
  actualOrder: string[];
  bands: Record<string, Record<string, number>>;
  scores: Record<string, PredictTableScoreResult>;
  standingsUpdatedAt: string | null;
  standingsUpdatedLabel: string | null;
  standingsPlayed: { min: number; max: number } | null;
  standingsStale: boolean;
  eligibleCohortSize: number;
}

const BAND_COUNT = TABLE_BANDS.length;
const PAGE = "mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4";

function readOptions(params: URLSearchParams): Options {
  const out = { ...OPTION_DEFAULTS };
  for (const key of Object.keys(out) as (keyof Options)[]) {
    const value = params.get(key);
    if (value) out[key] = value;
  }
  return out;
}

export function TableComparePrototype({ payload }: { payload: ProtoPayload }) {
  const searchParams = useSearchParams();
  const [options, setOptions] = useState<Options>(() =>
    readOptions(new URLSearchParams(searchParams.toString())),
  );
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  function setOption(key: keyof Options, value: string) {
    setOptions((prev) => {
      const next = { ...prev, [key]: value };
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
      window.history.replaceState(null, "", `?${params.toString()}`);
      return next;
    });
  }

  const playersById = useMemo(
    () => new Map(payload.players.map((p) => [p.id, p])),
    [payload.players],
  );
  const youId = options.you || payload.viewerId;
  const vsId =
    options.vs ||
    payload.players.find((p) => p.hasTable && p.id !== youId)?.id ||
    "";
  const youPlayer = playersById.get(youId);
  const themPlayer = playersById.get(vsId);

  const actualOrder = options.q6 === "none" ? [] : payload.actualOrder;
  const stale =
    options.q6 === "stale" || (options.q6 === "live" && payload.standingsStale);

  const panel = (
    <ProtoPanel
      payload={payload}
      options={options}
      setOption={setOption}
      youId={youId}
      vsId={vsId}
    />
  );

  // Same back-link and Headline as /picks/[playerId] -- this is the same
  // kind of destination, reached from the same leaderboard row panel.
  const top = (
    <>
      <Link
        href={"/leaderboard?segment=table" as Route}
        className={`-ml-2 flex min-h-11 w-fit items-center gap-0.5 rounded-btn-sm px-2 ${T.caption} font-bold ${TX.muted} hover:bg-ink/5 ${FOCUS}`}
      >
        <ChevronLeft className="size-4" aria-hidden />
        Leaderboard
      </Link>
      <h1 className={`${T.h1} font-extrabold leading-tight ${TX.base}`}>
        Predict the Table
      </h1>
    </>
  );

  if (!youPlayer?.hasTable || !themPlayer?.hasTable) {
    return (
      <main className={PAGE}>
        {top}
        <p className={`${T.caption} ${TX.muted}`}>
          {!youPlayer?.hasTable
            ? `${youPlayer?.displayName ?? "This player"} has no submitted table, so there's nothing to compare. Pick another "You" in the prototype panel.`
            : "Pick a player to compare with in the prototype panel."}
        </p>
        {panel}
      </main>
    );
  }

  if (actualOrder.length !== 20) {
    return (
      <main className={PAGE}>
        {top}
        {/* Q6 proposal: before the first standings sync there is nothing to
            score against. Said in the leaderboard's own empty-state voice
            (a muted caption), not drawn as an empty chart. */}
        <p className={`${T.caption} ${TX.muted}`}>
          Nothing to compare yet. Tables are scored against the real league
          table, and that arrives with the first standings update.
        </p>
        {panel}
      </main>
    );
  }

  const youScore = payload.scores[youId];
  const themScore = payload.scores[vsId];
  const youBands = new Map(Object.entries(payload.bands[youId] ?? {}));
  const themBands = new Map(Object.entries(payload.bands[vsId] ?? {}));
  const teamsById = new Map(payload.teams.map((t) => [t.id, t]));
  const sections = buildSections(
    actualOrder,
    teamsById,
    youBands,
    themBands,
    youScore,
    themScore,
  );
  const youTotals = totals(youScore, youBands, actualOrder);
  const themTotals = totals(themScore, themBands, actualOrder);
  const openRow =
    sections.flatMap((s) => s.rows).find((r) => r.teamId === openTeamId) ??
    null;

  return (
    <main className={`${PAGE} ${openRow ? "pb-72" : ""}`}>
      {top}

      <Header
        you={youPlayer}
        them={themPlayer}
        youTotals={youTotals}
        themTotals={themTotals}
        options={options}
      />

      {stale ? (
        // Q6 proposal for stale standings: keep the chart, and say how old
        // the table it's measured against is -- in the muted caption the
        // leaderboard uses for its explanatory lines.
        <p className={`${T.caption} ${TX.muted}`}>
          Measured against the league table from{" "}
          {payload.standingsUpdatedLabel ?? "a while ago"}. Scores catch up at
          the next update.
        </p>
      ) : null}

      {/* A plain surface card, not CardShell: CardShell's overflow-hidden
          makes the card a scroll container, which pins the sticky axis to
          the card instead of the page. overflow-clip rounds the corners
          without that side effect. */}
      <div className={`overflow-clip rounded-card bg-surface ${CARD_SHADOW}`}>
        <AxisHeader options={options} />
        <ol className="flex flex-col">
          {sections.map((section) => {
            const band = TABLE_BANDS[section.bandIndex];
            const { Icon, positions } = BAND_META[band.key];
            return (
              <li
                key={section.bandIndex}
                className="border-t border-paper-line first:border-t-0"
              >
                {/* The /picks in-card week heading (Label, muted), with the
                    Band's wayfinding icon as BandSummary carries it. */}
                <div
                  className={`flex items-center gap-1.5 ${INSET} pt-2.5 pb-0.5 ${TX.muted}`}
                >
                  <Icon className="size-3.5" aria-hidden />
                  <span className={LABEL}>{section.label}</span>
                  <span className={`${T.caption} font-medium tabular-nums`}>
                    {positions}
                  </span>
                </div>
                <ul>
                  {section.rows.map((row) => (
                    <Row
                      key={row.teamId}
                      row={row}
                      options={options}
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
          themName={themPlayer.displayName}
          options={options}
          onClose={() => setOpenTeamId(null)}
        />
      ) : null}

      {panel}
    </main>
  );
}

// ---------------------------------------------------------------------------

function greenFor(mine: number, theirs: number, options: Options): boolean {
  if (mine > theirs) return true;
  if (mine === theirs && mine > 0) return options.q8 === "both";
  return false;
}

function Header({
  you,
  them,
  youTotals,
  themTotals,
  options,
}: {
  you: ProtoPlayer;
  them: ProtoPlayer;
  youTotals: SideTotals;
  themTotals: SideTotals;
  options: Options;
}) {
  // Q9: "shell" is /picks/[playerId]'s ink identity band over a white body;
  // "plain" keeps the whole card white. Pitch Green is never text on ink
  // (DESIGN.md -> Pitch Green), so the band's totals are never green.
  const shell = options.q9 !== "plain";
  const green = (mine: number, theirs: number) =>
    greenFor(mine, theirs, options) ? "text-success" : TX.base;
  const bandGreen = (mine: number, theirs: number) =>
    shell ? TX.onInk : green(mine, theirs);

  const sentence = headerSentence(
    options.q10 as SentenceRule,
    them.displayName,
    youTotals,
    themTotals,
  );

  // Component names as the Predict the Table leaderboard panel spells them.
  const rows: { label: string; you: number; them: number; key: string }[] = [
    {
      key: "placement",
      label: "Placement",
      you: youTotals.placement,
      them: themTotals.placement,
    },
    {
      key: "bands",
      label: "Bands",
      you: youTotals.bands,
      them: themTotals.bands,
    },
    {
      key: "bold",
      label: "Bold calls",
      you: youTotals.boldCalls,
      them: themTotals.boldCalls,
    },
  ];

  function boldCell(player: ProtoPlayer, valueNum: number) {
    if (!player.isLateJoiner) return String(valueNum);
    // DESIGN.md: never a dash for a missing value, so the options are a
    // word or the true value (a Late Joiner's Bold Calls really are 0).
    return options.q4 === "zero" ? String(valueNum) : "Not eligible";
  }

  return (
    <CardShell className="bg-surface">
      <div
        className={`grid grid-cols-2 gap-3 ${INSET} py-3.5 ${shell ? "bg-ink" : "border-b border-paper-line"}`}
      >
        <Who
          player={you}
          label="You"
          total={youTotals.total}
          totalClass={bandGreen(youTotals.total, themTotals.total)}
          shell={shell}
          showLate={options.q4b === "name"}
        />
        <Who
          player={them}
          label={them.displayName}
          total={themTotals.total}
          totalClass={bandGreen(themTotals.total, youTotals.total)}
          shell={shell}
          alignEnd
          showLate={options.q4b === "name"}
        />
      </div>

      <div className={`flex flex-col gap-3 ${INSET} py-4`}>
        <p
          className={`max-w-[52ch] ${T.body} font-bold leading-snug ${TX.base}`}
        >
          {sentence}
        </p>

        <table className={`w-full ${T.dense} tabular-nums`}>
          <thead>
            <tr className={`${LABEL} ${TX.muted}`}>
              <th className="pb-1 text-left font-bold" scope="col">
                <span className="sr-only">Score part</span>
              </th>
              <th className="pb-1 text-right font-bold" scope="col">
                You
                {options.q4b === "column" && you.isLateJoiner ? (
                  <LateChip />
                ) : null}
              </th>
              <th className="pb-1 text-right font-bold" scope="col">
                {them.displayName}
                {options.q4b === "column" && them.isLateJoiner ? (
                  <LateChip />
                ) : null}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-paper-line">
                <th
                  scope="row"
                  className={`py-1.5 text-left font-normal ${TX.muted}`}
                >
                  {r.label}
                </th>
                <td
                  className={`py-1.5 text-right font-extrabold ${green(r.you, r.them)}`}
                >
                  {r.key === "bold" ? boldCell(you, r.you) : r.you}
                </td>
                <td
                  className={`py-1.5 text-right font-extrabold ${green(r.them, r.you)}`}
                >
                  {r.key === "bold" ? boldCell(them, r.them) : r.them}
                </td>
              </tr>
            ))}
            <tr className="border-t border-paper-line">
              <th
                scope="row"
                className={`py-1.5 text-left font-bold ${TX.base}`}
              >
                Total
              </th>
              <td
                className={`py-1.5 text-right font-extrabold ${green(youTotals.total, themTotals.total)}`}
              >
                {youTotals.total}
              </td>
              <td
                className={`py-1.5 text-right font-extrabold ${green(themTotals.total, youTotals.total)}`}
              >
                {themTotals.total}
              </td>
            </tr>
          </tbody>
        </table>

        <p className={`${T.caption} ${TX.muted}`}>
          <span className="font-bold">Exactly right: </span>
          you, {youTotals.exactBands.join(", ") || "none yet"}.{" "}
          {them.displayName}, {themTotals.exactBands.join(", ") || "none yet"}.
        </p>
      </div>
    </CardShell>
  );
}

function LateChip() {
  // Neutral Teal is the Late Joiner badge role (DESIGN.md -> Neutral Teal).
  return (
    <span
      className={`ml-1.5 rounded-badge bg-info px-1.5 py-0.5 ${MICRO_LABEL} ${TX.onInk}`}
    >
      Late
    </span>
  );
}

function Who({
  player,
  label,
  total,
  totalClass,
  shell,
  alignEnd,
  showLate,
}: {
  player: ProtoPlayer;
  label: string;
  total: number;
  totalClass: string;
  shell: boolean;
  alignEnd?: boolean;
  showLate: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 ${alignEnd ? "items-end text-right" : ""}`}
    >
      <div
        className={`flex min-w-0 items-center gap-2 ${alignEnd ? "flex-row-reverse" : ""}`}
      >
        <EmojiChip emoji={player.emoji} onDark={shell} />
        <span
          className={`min-w-0 truncate ${T.body} font-bold ${shell ? TX.onInk : TX.base}`}
        >
          {label}
        </span>
        {player.isLateJoiner && showLate ? <LateChip /> : null}
      </div>
      {/* The leaderboard's `n/200`, set at Display size like /picks'
          header total. */}
      <span className="flex items-baseline gap-0.5">
        <span
          className={`${T.score} font-extrabold leading-none tabular-nums ${totalClass}`}
        >
          {total}
        </span>
        <span
          className={`${LABEL} tabular-nums ${shell ? TX.onInkMuted : TX.muted}`}
        >
          /{MAX_PREDICT_TABLE_SCORE}
        </span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Row grid: label | 8-Band axis | You | Them. Shared by axis and rows. */
function gridCols(options: Options): string {
  return options.q5 === "name"
    ? "grid-cols-[5.5rem_1fr_2.25rem_2.25rem]"
    : "grid-cols-[2.75rem_1fr_2.25rem_2.25rem]";
}

function AxisHeader({ options }: { options: Options }) {
  return (
    // Sticky: once the header scrolls away nothing else names the columns.
    // Same treatment as /picks' sticky PicksLegend.
    <div
      className={`sticky top-0 z-10 grid ${gridCols(options)} items-end gap-1.5 border-b border-paper-line bg-surface ${INSET} py-1.5`}
    >
      <span aria-hidden />
      <div className="grid grid-cols-8">
        {/* Q11: position ranges ("12-14") don't fit eight-across on one
            line at phone width. Either each Band's wayfinding icon
            (BAND_META), or the range stacked over two lines. */}
        {TABLE_BANDS.map((band) => {
          const { Icon, positions } = BAND_META[band.key];
          const [from, to] = positions.split("-");
          return (
            <span
              key={band.key}
              className={`flex flex-col items-center leading-none ${TX.muted}`}
              title={`${band.label} (${positions})`}
            >
              {options.q11 === "positions" ? (
                <span
                  className={`flex flex-col items-center ${T.label} font-bold tabular-nums`}
                  aria-hidden
                >
                  <span>{from}</span>
                  {to ? <span>{to}</span> : null}
                </span>
              ) : (
                <Icon className="size-3.5" aria-hidden />
              )}
              <span className="sr-only">{band.label}</span>
            </span>
          );
        })}
      </div>
      <span className={`text-right ${LABEL} ${TX.muted}`}>You</span>
      <span className={`text-right ${LABEL} ${TX.muted}`}>Them</span>
    </div>
  );
}

const pct = (n: number) => `${String((n * 100) / BAND_COUNT)}%`;
const centre = (band: number) => pct(band + 0.5);

function Lane({
  call,
  actualBand,
  who,
  top,
  showStar,
  unplacedLabel,
}: {
  call: SideCall;
  actualBand: number;
  who: "you" | "them";
  top: string;
  showStar: boolean;
  unplacedLabel: boolean;
}) {
  const you = who === "you";
  if (call.band === null) {
    return unplacedLabel ? (
      <span
        className={`absolute left-0 -translate-y-1/2 ${T.label} font-bold ${TX.muted}`}
        style={{ top }}
      >
        {you ? "You" : "Them"}: not placed
      </span>
    ) : null;
  }
  const from = Math.min(call.band, actualBand);
  const span = Math.abs(call.band - actualBand);
  return (
    <>
      {span > 0 ? (
        // Gold as a bar for your own call (DESIGN.md -> Trophy Gold, "a
        // fill, a bar, a ring"); the peer's bar in the muted text role.
        <span
          aria-hidden
          className={`absolute -translate-y-1/2 rounded-badge ${you ? "h-1.5 bg-accent" : "h-0.5 bg-text-muted"}`}
          style={{ top, left: centre(from), width: pct(span) }}
        />
      ) : null}
      <span
        aria-hidden
        className={`absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-badge ${
          you ? "bg-accent ring-1 ring-ink" : "border-2 border-ink bg-surface"
        }`}
        style={{ top, left: centre(call.band) }}
      />
      {showStar ? (
        // A lucide icon, not a ★ glyph: functional marks come from the icon
        // set (DESIGN.md -> Do's).
        <Star
          aria-hidden
          className={`absolute size-3 -translate-y-1/2 translate-x-2.5 fill-current ${TX.base}`}
          style={{ top, left: centre(call.band) }}
        />
      ) : null}
    </>
  );
}

function Row({
  row,
  options,
  open,
  onTap,
}: {
  row: CompareRow;
  options: Options;
  open: boolean;
  onTap: () => void;
}) {
  const starYou = row.you.boldCall && options.q3 !== "none";
  const starThem = row.them.boldCall && options.q3 === "both";
  const unplacedLabel = options.q2 === "label";

  return (
    <li>
      <button
        type="button"
        id={`row-${row.teamId}`}
        onClick={onTap}
        aria-expanded={open}
        className={`grid min-h-11 w-full ${gridCols(options)} items-center gap-1.5 ${INSET} text-left ${open ? "bg-paper" : "hover:bg-paper/60"} ${FOCUS}`}
      >
        <span className="flex min-w-0 items-center">
          {options.q5 === "name" ? (
            <span className={`truncate ${T.caption} font-bold ${TX.base}`}>
              {row.name}
            </span>
          ) : (
            // BandSummary's club identity: the code on its kit colour, run
            // through the contrast floor (DESIGN.md -> Kit Colour Rule).
            <ClubCodeBadge
              shortCode={row.shortCode}
              fill={teamFill(row.shortCode)}
            />
          )}
          <span className="sr-only">
            , finished {ordinal(row.position)}. You{" "}
            {placementReason(row.you, row.actualBand)}. Them{" "}
            {placementReason(row.them, row.actualBand)}.
          </span>
        </span>

        <span className="relative h-11" aria-hidden>
          {/* The Band these clubs finished in (paper, the app's ground), with
              its finish line down the centre. */}
          <span
            className="absolute inset-y-0 bg-paper"
            style={{ left: pct(row.actualBand), width: pct(1) }}
          />
          <span
            className="absolute inset-y-0 w-px bg-ink"
            style={{ left: centre(row.actualBand) }}
          />
          <Lane
            call={row.you}
            actualBand={row.actualBand}
            who="you"
            top="34%"
            showStar={starYou}
            unplacedLabel={unplacedLabel}
          />
          <Lane
            call={row.them}
            actualBand={row.actualBand}
            who="them"
            top="68%"
            showStar={starThem}
            unplacedLabel={unplacedLabel}
          />
        </span>

        <PointsCell
          mine={row.you.points}
          theirs={row.them.points}
          options={options}
        />
        <PointsCell
          mine={row.them.points}
          theirs={row.you.points}
          options={options}
        />
      </button>
    </li>
  );
}

function PointsCell({
  mine,
  theirs,
  options,
}: {
  mine: number;
  theirs: number;
  options: Options;
}) {
  const green = greenFor(mine, theirs, options);
  return (
    // `+5` / `0` through the app's own pointLabel (DESIGN.md -> Do's).
    <span
      className={`text-right ${T.caption} tabular-nums ${
        green
          ? "font-extrabold text-success"
          : mine === 0
            ? TX.muted
            : `font-bold ${TX.base}`
      }`}
      aria-hidden
    >
      {pointLabel(mine)}
    </span>
  );
}

// ---------------------------------------------------------------------------

function TapCard({
  row,
  themName,
  options,
  onClose,
}: {
  row: CompareRow;
  themName: string;
  options: Options;
  onClose: () => void;
}) {
  const band = TABLE_BANDS[row.actualBand];
  const cardRef = useRef<HTMLDivElement>(null);

  // The design keeps the tapped row visible above the docked card, so once
  // the card has rendered (its height varies with its content) lift the row
  // clear of it if it landed underneath.
  useEffect(() => {
    const card = cardRef.current?.getBoundingClientRect();
    const tapped = document
      .getElementById(`row-${row.teamId}`)
      ?.getBoundingClientRect();
    if (!card || !tapped) return;
    const overlap = tapped.bottom - (card.top - 8);
    if (overlap > 0) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
      window.scrollBy({
        top: overlap,
        behavior: reduce.matches ? "auto" : "smooth",
      });
    }
  }, [row.teamId]);

  return (
    // Docked above the tab bar, no scrim, so the row stays visible above it.
    // A raised sheet: Matchday Lift, no border (DESIGN.md -> Elevation).
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
              Finished {ordinal(row.position)} · {band.label}
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
        {options.q12 === "text" ? (
          <dl
            className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 ${INSET} pt-2 pb-4 ${T.dense}`}
          >
            <CardLine who="You" call={row.you} actualBand={row.actualBand} />
            <CardLine
              who={themName}
              call={row.them}
              actualBand={row.actualBand}
            />
          </dl>
        ) : (
          <div className={`flex flex-col gap-3 ${INSET} pt-3 pb-4`}>
            {/* Read in one glance: WHERE each call landed is the ladder,
                HOW MUCH it scored is the tiles. The prose is for screen
                readers only. */}
            <p className="sr-only">
              You said{" "}
              {row.you.band === null
                ? "nothing"
                : TABLE_BANDS[row.you.band].label}
              , {placementReason(row.you, row.actualBand)}. {themName} said{" "}
              {row.them.band === null
                ? "nothing"
                : TABLE_BANDS[row.them.band].label}
              , {placementReason(row.them, row.actualBand)}.
            </p>
            <Ladder row={row} options={options} />
            <div className="grid grid-cols-2 gap-2">
              <ScoreTile
                name="You"
                who="you"
                call={row.you}
                theirs={row.them.points}
                options={options}
              />
              <ScoreTile
                name={themName}
                who="them"
                call={row.them}
                theirs={row.you.points}
                options={options}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The tapped row, enlarged and labelled: the same marks, bars, finished
 * column and finish line, with each Band's positions written underneath.
 * At card width the ranges fit on one line, which the row's axis can't.
 */
function Ladder({ row, options }: { row: CompareRow; options: Options }) {
  const starYou = row.you.boldCall && options.q3 !== "none";
  const starThem = row.them.boldCall && options.q3 === "both";
  return (
    <div className="relative" aria-hidden>
      <span
        className="absolute inset-y-0 rounded-btn-sm bg-paper"
        style={{ left: pct(row.actualBand), width: pct(1) }}
      />
      <span className="relative block h-12">
        <span
          className="absolute inset-y-1 w-px bg-ink"
          style={{ left: centre(row.actualBand) }}
        />
        <Lane
          call={row.you}
          actualBand={row.actualBand}
          who="you"
          top="32%"
          showStar={starYou}
          unplacedLabel={options.q2 === "label"}
        />
        <Lane
          call={row.them}
          actualBand={row.actualBand}
          who="them"
          top="70%"
          showStar={starThem}
          unplacedLabel={options.q2 === "label"}
        />
      </span>
      <span className="relative grid grid-cols-8 pb-1.5">
        {TABLE_BANDS.map((band, index) => (
          // A range stacks first-over-last ("12" over "14"): at phone width
          // a column is ~36px, too narrow for "12-14" on one line.
          <span
            key={band.key}
            className={`flex flex-col items-center leading-tight ${T.label} tabular-nums ${
              index === row.actualBand
                ? `font-extrabold ${TX.base}`
                : `font-bold ${TX.muted}`
            }`}
          >
            {BAND_META[band.key].positions.split("-").map((part) => (
              <span key={part}>{part}</span>
            ))}
          </span>
        ))}
      </span>
    </div>
  );
}

/** One player's verdict on this club: whose, how many points, which Band. */
function ScoreTile({
  name,
  who,
  call,
  theirs,
  options,
}: {
  name: string;
  who: "you" | "them";
  call: SideCall;
  theirs: number;
  options: Options;
}) {
  const green = greenFor(call.points, theirs, options);
  return (
    // The leaderboard panel's Stat cell, scaled up: paper ground, the
    // non-interactive radius, no shadow (DESIGN.md -> Printed Controls).
    <div className="flex min-w-0 flex-col gap-1.5 rounded-btn-sm bg-paper px-3 py-2.5">
      <span className="flex min-w-0 items-center gap-1.5">
        {/* The same mark as on the ladder, so the tile names its marker. */}
        <span
          aria-hidden
          className={`size-2.5 shrink-0 rounded-badge ${
            who === "you" ? "bg-accent ring-1 ring-ink" : "border-2 border-ink"
          }`}
        />
        <span className={`truncate ${MICRO_LABEL} ${TX.muted}`}>{name}</span>
      </span>
      <span
        className={`${T.h2} font-extrabold leading-none tabular-nums ${
          green ? "text-success" : call.points === 0 ? TX.muted : TX.base
        }`}
      >
        {pointLabel(call.points)}
      </span>
      {/* Wraps rather than truncates: the Band name is the tile's whole
          answer to "what did they say". */}
      <span className={`${T.caption} font-bold leading-snug ${TX.base}`}>
        {call.band === null ? "Not placed" : TABLE_BANDS[call.band].label}
      </span>
      {call.boldCall ? (
        <span
          className={`flex items-center gap-1 ${T.caption} font-bold ${TX.base}`}
        >
          <Star className="size-3 fill-current" aria-hidden />
          {BOLD_CALL_SHORT}
        </span>
      ) : null}
    </div>
  );
}

function CardLine({
  who,
  call,
  actualBand,
}: {
  who: string;
  call: SideCall;
  actualBand: number;
}) {
  return (
    <>
      <dt className={`font-bold ${TX.base}`}>{who}</dt>
      <dd className={TX.base}>
        {call.band === null
          ? "Not placed"
          : `Said ${TABLE_BANDS[call.band].label}`}
        <span className={`block ${T.caption} ${TX.muted}`}>
          {placementReason(call, actualBand)}
        </span>
        {call.boldCall ? (
          <span
            className={`flex items-center gap-1 ${T.caption} font-bold ${TX.base}`}
          >
            <Star className="size-3 fill-current" aria-hidden />
            {BOLD_CALL_LINE}
          </span>
        ) : null}
      </dd>
    </>
  );
}
