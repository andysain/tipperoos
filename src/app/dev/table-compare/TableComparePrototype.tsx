"use client";

// PROTOTYPE -- issue #214. G, the dumbbell view, in comparison mode, with
// each of the issue's open questions as a switchable option. Throwaway: no
// tests, minimal error handling, and it never ships to Production.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";
import type { PredictTableScoreResult } from "@/lib/scoring/predict-table";
import { TABLE_BANDS } from "@/lib/table-predictions/rules";
import { BAND_META, ordinal } from "@/app/predict-table/shared";
import { EmojiChip } from "@/components/ui/PlayerChip";
import { CardShell } from "@/components/ui/CardShell";
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

  const backLink = (
    <Link
      href={"/leaderboard?segment=table" as Route}
      className={`-ml-2 flex min-h-11 w-fit items-center gap-0.5 rounded-btn-sm px-2 ${T.caption} font-bold ${TX.muted} hover:bg-ink/5 ${FOCUS}`}
    >
      <ChevronLeft className="size-4" aria-hidden />
      Leaderboard
    </Link>
  );

  if (!youPlayer?.hasTable || !themPlayer?.hasTable) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
        {backLink}
        <p className={`${T.body} ${TX.base}`}>
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
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
        {backLink}
        <h1 className={`${T.h1} font-extrabold leading-tight text-text`}>
          You vs {themPlayer.displayName}
        </h1>
        {/* Q6 proposal: before the first standings sync there is nothing
            to score against, so say so plainly instead of drawing an empty
            chart. */}
        <CardShell className={`bg-surface ${INSET} py-4`}>
          <p className={`${T.body} font-bold ${TX.base}`}>
            No scores to compare yet
          </p>
          <p className={`${T.dense} ${TX.muted}`}>
            Tables are scored against the real league table. That shows up here
            after its first update.
          </p>
        </CardShell>
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
    <main
      className={`mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4 ${openRow ? "pb-72" : ""}`}
    >
      {backLink}

      <Header
        you={youPlayer}
        them={themPlayer}
        youTotals={youTotals}
        themTotals={themTotals}
        options={options}
      />

      {stale ? (
        // Q6 proposal for stale standings: keep the chart, say how old the
        // table it's measured against is.
        <p
          className={`rounded-btn bg-warning/25 ${INSET} py-2 ${T.caption} font-bold ${TX.base}`}
        >
          Measured against the league table from{" "}
          {payload.standingsUpdatedLabel ?? "a while ago"}. Scores catch up at
          the next update.
        </p>
      ) : null}

      {/* Not CardShell: its overflow-hidden makes the card a scroll
          container, which pins the sticky axis to the card instead of the
          page. overflow-clip rounds the corners without that side effect. */}
      <div className={`overflow-clip rounded-card bg-surface ${CARD_SHADOW}`}>
        <AxisHeader options={options} />
        <ol className="flex flex-col">
          {sections.map((section) => (
            <li key={section.bandIndex}>
              <div
                className={`flex items-baseline gap-2 border-t border-paper-line bg-paper/60 ${INSET} py-1.5`}
              >
                <span className={`${MICRO_LABEL} ${TX.base}`}>
                  {section.label}
                </span>
                <span className={`${T.label} ${TX.muted} tabular-nums`}>
                  {BAND_META[TABLE_BANDS[section.bandIndex].key].positions}
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
          ))}
        </ol>
      </div>

      {openRow ? (
        <TapCard
          row={openRow}
          themName={themPlayer.displayName}
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
  const ink = options.q9 === "ink";
  const base = ink ? "text-on-ink" : TX.base;
  const muted = ink ? "text-on-ink-muted" : TX.muted;
  const line = ink ? "border-paper/15" : "border-paper-line";
  // Q9: on ink, Pitch Green is never text (DESIGN.md -> Pitch Green).
  const green = (mine: number, theirs: number) =>
    !ink && greenFor(mine, theirs, options) ? "text-success" : base;

  const sentence = headerSentence(
    options.q10 as SentenceRule,
    them.displayName,
    youTotals,
    themTotals,
  );

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
      label: "Bold Calls",
      you: youTotals.boldCalls,
      them: themTotals.boldCalls,
    },
  ];

  function boldCell(player: ProtoPlayer, valueNum: number) {
    if (!player.isLateJoiner) return String(valueNum);
    return options.q4 === "text" ? "Not eligible" : "—";
  }

  return (
    <CardShell className={ink ? "bg-ink" : "bg-surface"}>
      <div className={`flex flex-col gap-3 ${INSET} py-4`}>
        <div className="grid grid-cols-2 gap-3">
          <Who
            player={you}
            label="You"
            total={youTotals.total}
            totalClass={green(youTotals.total, themTotals.total)}
            ink={ink}
          />
          <Who
            player={them}
            label={them.displayName}
            total={themTotals.total}
            totalClass={green(themTotals.total, youTotals.total)}
            ink={ink}
            alignEnd
          />
        </div>

        <p className={`${T.body} font-bold leading-snug ${base}`}>{sentence}</p>

        <table className={`w-full ${T.dense} tabular-nums`}>
          <thead>
            <tr className={`${LABEL} ${muted}`}>
              <th className="py-1 text-left font-bold" scope="col">
                <span className="sr-only">Component</span>
              </th>
              <th className="py-1 text-right font-bold" scope="col">
                You
              </th>
              <th className="py-1 text-right font-bold" scope="col">
                {them.displayName}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-t ${line}`}>
                <th
                  scope="row"
                  className={`py-1.5 text-left font-normal ${muted}`}
                >
                  {r.label}
                </th>
                <td
                  className={`py-1.5 text-right font-bold ${green(r.you, r.them)}`}
                >
                  {r.key === "bold" ? boldCell(you, r.you) : r.you}
                </td>
                <td
                  className={`py-1.5 text-right font-bold ${green(r.them, r.you)}`}
                >
                  {r.key === "bold" ? boldCell(them, r.them) : r.them}
                </td>
              </tr>
            ))}
            <tr className={`border-t-2 ${line}`}>
              <th scope="row" className={`py-1.5 text-left font-bold ${base}`}>
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

        <p className={`${T.caption} ${muted}`}>
          <span className="font-bold">Exactly right — </span>
          You: {youTotals.exactBands.join(", ") || "none yet"} ·{" "}
          {them.displayName}: {themTotals.exactBands.join(", ") || "none yet"}
        </p>
      </div>
    </CardShell>
  );
}

function Who({
  player,
  label,
  total,
  totalClass,
  ink,
  alignEnd,
}: {
  player: ProtoPlayer;
  label: string;
  total: number;
  totalClass: string;
  ink: boolean;
  alignEnd?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 ${alignEnd ? "items-end text-right" : ""}`}
    >
      <div
        className={`flex items-center gap-2 ${alignEnd ? "flex-row-reverse" : ""}`}
      >
        <EmojiChip emoji={player.emoji} onDark={ink} />
        <span
          className={`min-w-0 truncate ${T.body} font-bold ${ink ? "text-on-ink" : TX.base}`}
        >
          {label}
        </span>
      </div>
      {player.isLateJoiner ? (
        // Q4: the Late badge sits by the name in the header, in Neutral
        // Teal's badge role (DESIGN.md -> Neutral Teal).
        <span
          className={`rounded-badge px-1.5 py-0.5 ${MICRO_LABEL} ${ink ? "bg-paper/15 text-on-ink" : "bg-info text-on-ink"}`}
        >
          Late
        </span>
      ) : null}
      <span className={`${T.score} font-extrabold leading-none ${totalClass}`}>
        {total}
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
    <div
      className={`sticky top-0 z-[1] grid ${gridCols(options)} items-end gap-1.5 border-b border-paper-line bg-surface ${INSET} py-1.5`}
    >
      <span aria-hidden />
      <div className="grid grid-cols-8">
        {/* Position ranges ("12-14") don't fit eight-across at phone
            width, so the axis uses each Band's existing wayfinding icon
            (BAND_META) and leaves the name to the section headings. */}
        {TABLE_BANDS.map((band) => {
          const { Icon } = BAND_META[band.key];
          return (
            <span
              key={band.key}
              className={`flex justify-center ${TX.muted}`}
              title={`${band.label} (${BAND_META[band.key].positions})`}
            >
              <Icon className="size-3.5" aria-hidden />
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
  if (call.band === null) {
    return unplacedLabel ? (
      <span
        className={`absolute left-0 -translate-y-1/2 ${T.label} font-bold ${TX.muted}`}
        style={{ top }}
      >
        {who === "you" ? "You" : "Them"}: not placed
      </span>
    ) : null;
  }
  const from = Math.min(call.band, actualBand);
  const span = Math.abs(call.band - actualBand);
  return (
    <>
      {span > 0 ? (
        <span
          aria-hidden
          className={`absolute -translate-y-1/2 rounded-full ${who === "you" ? "h-1.5 bg-accent" : "h-0.5 bg-ink/50"}`}
          style={{ top, left: centre(from), width: pct(span) }}
        />
      ) : null}
      <span
        aria-hidden
        className={`absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
          who === "you"
            ? "bg-accent ring-1 ring-ink/40"
            : "border-2 border-ink bg-surface"
        }`}
        style={{ top, left: centre(call.band) }}
      />
      {showStar ? (
        <span
          aria-hidden
          className={`absolute -translate-y-1/2 pl-2.5 ${T.label} leading-none text-ink`}
          style={{ top, left: centre(call.band) }}
        >
          ★
        </span>
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
        onClick={(event) => {
          onTap();
          // The design keeps the tapped row visible above the docked card,
          // so lift it clear if it would land underneath. 17rem ~ the card
          // plus the 4rem tab bar; good enough for a prototype.
          const row = event.currentTarget.getBoundingClientRect();
          const clearance = window.innerHeight - 17 * 16;
          if (!open && row.bottom > clearance) {
            window.scrollBy({
              top: row.bottom - clearance + 8,
              behavior: "smooth",
            });
          }
        }}
        aria-expanded={open}
        className={`grid min-h-11 w-full ${gridCols(options)} items-center gap-1.5 border-t border-paper-line/60 ${INSET} text-left first:border-t-0 ${open ? "bg-ink/5" : ""} ${FOCUS}`}
      >
        <span className="flex min-w-0 items-center">
          {options.q5 === "name" ? (
            <span className={`truncate ${T.caption} font-bold ${TX.base}`}>
              {row.name}
            </span>
          ) : (
            <span
              className={`${T.caption} font-extrabold tracking-wide ${TX.base}`}
            >
              {row.shortCode ?? "?"}
            </span>
          )}
          <span className="sr-only">
            , finished {ordinal(row.position)}. You{" "}
            {placementReason(row.you, row.actualBand)}. Them{" "}
            {placementReason(row.them, row.actualBand)}.
          </span>
        </span>

        <span className="relative h-11" aria-hidden>
          {/* The Band these clubs finished in, with its finish line. */}
          <span
            className="absolute inset-y-0 bg-ink/6"
            style={{ left: pct(row.actualBand), width: pct(1) }}
          />
          <span
            className="absolute inset-y-0 w-px bg-ink/45"
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
      {mine > 0 ? `+${String(mine)}` : "0"}
    </span>
  );
}

// ---------------------------------------------------------------------------

function TapCard({
  row,
  themName,
  onClose,
}: {
  row: CompareRow;
  themName: string;
  onClose: () => void;
}) {
  const band = TABLE_BANDS[row.actualBand];
  return (
    // Docked above the tab bar, no scrim, so the row stays visible above it.
    <div
      className={`fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto w-full max-w-4xl px-3`}
      role="dialog"
      aria-label={`${row.name} details`}
    >
      <div
        className={`rounded-card bg-surface ${CARD_SHADOW} ring-1 ring-paper-line`}
      >
        <div className={`flex items-start gap-2 ${INSET} pt-3`}>
          <div className="flex-1">
            <p className={`${T.body} font-extrabold ${TX.base}`}>{row.name}</p>
            <p className={`${T.caption} ${TX.muted}`}>
              Finished {ordinal(row.position)} · {band.label}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`-mr-2 grid size-11 place-items-center rounded-btn-sm ${TX.muted} hover:bg-ink/5 ${FOCUS}`}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <dl
          className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 ${INSET} pb-4 pt-2 ${T.dense}`}
        >
          <CardLine who="You" call={row.you} actualBand={row.actualBand} />
          <CardLine
            who={themName}
            call={row.them}
            actualBand={row.actualBand}
          />
        </dl>
      </div>
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
          ? "Didn't place it"
          : `Said ${TABLE_BANDS[call.band].label}`}
        <span className={`block ${T.caption} ${TX.muted}`}>
          {placementReason(call, actualBand)}
          {call.boldCall ? ` · ${BOLD_CALL_LINE}` : ""}
        </span>
      </dd>
    </>
  );
}
