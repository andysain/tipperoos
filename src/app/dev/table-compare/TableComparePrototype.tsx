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
import { Check, ChevronDown, ChevronLeft, Star, X } from "lucide-react";
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
  MAX_BAND_BONUS,
  MAX_BOLD_CALLS_SCORE,
  MAX_PLACEMENT,
  bandBonus,
  breakdown,
  buildSections,
  exactBandsLine,
  headerSentence,
  isSeasonOver,
  placementReason,
  totals,
  withExactBand,
  type CompareRow,
  type CompareSection,
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
  const [cardHeight, setCardHeight] = useState(0);

  // The URL write happens outside the state updater: Next's router listens
  // to history.replaceState, and updating it from inside a React updater
  // re-entered rendering ("Cannot update a component (Router) while
  // rendering").
  function setOption(key: keyof Options, value: string) {
    const next = { ...options, [key]: value };
    setOptions(next);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    window.history.replaceState(null, "", `?${params.toString()}`);
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

  // Q13: the real scores, or a simulated exact Relegated Band for one side.
  const RELEGATED = TABLE_BANDS.length - 1;
  const { bands: bandsAll, scores: scoresAll } = useMemo(() => {
    const target =
      options.q13 === "you" ? youId : options.q13 === "them" ? vsId : null;
    if (!target || payload.actualOrder.length !== 20) {
      return { bands: payload.bands, scores: payload.scores };
    }
    return withExactBand(
      payload.bands,
      new Map(payload.players.map((p) => [p.id, p.isLateJoiner])),
      payload.actualOrder,
      target,
      RELEGATED,
    );
  }, [options.q13, youId, vsId, payload, RELEGATED]);
  const stale =
    options.q6 === "stale" || (options.q6 === "live" && payload.standingsStale);
  const seasonOver = isSeasonOver(payload.standingsPlayed);

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

  const youScore = scoresAll[youId];
  const themScore = scoresAll[vsId];
  const youBands = new Map(Object.entries(bandsAll[youId] ?? {}));
  const themBands = new Map(Object.entries(bandsAll[vsId] ?? {}));
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

  const rowFor = (row: CompareRow) => (
    <Row
      key={row.teamId}
      row={row}
      options={options}
      seasonOver={seasonOver}
      open={row.teamId === openTeamId}
      onTap={() =>
        setOpenTeamId((id) => (id === row.teamId ? null : row.teamId))
      }
    />
  );

  return (
    <main
      className={PAGE}
      // While the docked card is open, pad by its measured height so the
      // last rows can still scroll out from under it.
      style={openRow ? { paddingBottom: cardHeight + 16 } : undefined}
    >
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
          Measured against the league table as of{" "}
          {payload.standingsUpdatedLabel ?? "its last update"}.
        </p>
      ) : null}

      {/* Q14: three structural takes on the same data. The header card,
          rows, key and tap card are shared, so the comparison is purely
          about how the page is organised. */}
      {options.q14 === "differences" ? (
        <DifferencesLayout
          sections={sections}
          youScore={youScore}
          themScore={themScore}
          themName={themPlayer.displayName}
          seasonOver={seasonOver}
          options={options}
          rowFor={rowFor}
        />
      ) : options.q14 === "cards" ? (
        <BandCardsLayout
          sections={sections}
          youScore={youScore}
          themScore={themScore}
          themName={themPlayer.displayName}
          seasonOver={seasonOver}
          options={options}
          rowFor={rowFor}
        />
      ) : (
        // A plain surface card, not CardShell: CardShell's overflow-hidden
        // makes the card a scroll container, which pins the sticky axis to
        // the card instead of the page. overflow-clip rounds the corners
        // without that side effect.
        <div className={`overflow-clip rounded-card bg-surface ${CARD_SHADOW}`}>
          <ChartKey themName={themPlayer.displayName} seasonOver={seasonOver} />
          <AxisHeader options={options} />
          <ol className="flex flex-col">
            {sections.map((section) => (
              <li
                key={section.bandIndex}
                className="border-t border-paper-line first:border-t-0"
              >
                {/* The /picks in-card week heading (Label, muted), with the
                    Band's wayfinding icon as BandSummary carries it. */}
                <div
                  className={`flex items-center gap-1.5 ${INSET} pt-2.5 pb-0.5 ${TX.muted}`}
                >
                  <BandHeading
                    bandIndex={section.bandIndex}
                    youBonus={bandBonus(youScore, section.bandIndex)}
                    themBonus={bandBonus(themScore, section.bandIndex)}
                    themName={themPlayer.displayName}
                  />
                </div>
                <ul>{section.rows.map(rowFor)}</ul>
              </li>
            ))}
          </ol>
        </div>
      )}

      {openRow ? (
        <TapCard
          row={openRow}
          themName={themPlayer.displayName}
          options={options}
          seasonOver={seasonOver}
          onHeight={setCardHeight}
          onClose={() => setOpenTeamId(null)}
        />
      ) : null}

      {panel}
    </main>
  );
}

// ---------------------------------------------------------------------------

/**
 * Whether this figure is the one that won the comparison. Shown by weight,
 * never Pitch Green: DESIGN.md defines green as "a correct pick", and the
 * winning figure is often a wrong-Band call that just lost less (a +1 two
 * Bands out). Level figures carry no emphasis (Q8).
 */
function leads(mine: number, theirs: number, options: Options): boolean {
  if (mine > theirs) return true;
  if (mine === theirs && mine > 0) return options.q8 === "both";
  return false;
}

/** Winner extrabold; the other figure plain; nothing scored, muted. */
function emphasis(mine: number, theirs: number, options: Options): string {
  if (leads(mine, theirs, options)) return `font-extrabold ${TX.base}`;
  return mine === 0 ? `font-medium ${TX.muted}` : `font-medium ${TX.base}`;
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
  // "plain" keeps the whole card white.
  const shell = options.q9 !== "plain";
  const weight = (mine: number, theirs: number) =>
    emphasis(mine, theirs, options);
  const bandTotal = () => (shell ? TX.onInk : TX.base);

  const sentence = headerSentence(
    options.q10 as SentenceRule,
    them.displayName,
    youTotals,
    themTotals,
  );

  // The glossary's names for the three parts, each with its maximum.
  const rows: {
    label: string;
    max: number;
    you: number;
    them: number;
    key: string;
  }[] = [
    {
      key: "placement",
      label: "Placement",
      max: MAX_PLACEMENT,
      you: youTotals.placement,
      them: themTotals.placement,
    },
    {
      key: "bands",
      label: "Band Bonus",
      max: MAX_BAND_BONUS,
      you: youTotals.bands,
      them: themTotals.bands,
    },
    {
      key: "bold",
      label: "Bold Calls",
      max: MAX_BOLD_CALLS_SCORE,
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
          totalClass={bandTotal()}
          shell={shell}
          showLate={options.q4b === "name"}
        />
        <Who
          player={them}
          label={them.displayName}
          total={themTotals.total}
          totalClass={bandTotal()}
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
                  <span className={`ml-1 ${T.caption} tabular-nums`}>
                    /{r.max}
                  </span>
                </th>
                <td className={`py-1.5 text-right ${weight(r.you, r.them)}`}>
                  {r.key === "bold" ? boldCell(you, r.you) : r.you}
                </td>
                <td className={`py-1.5 text-right ${weight(r.them, r.you)}`}>
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
                <span
                  className={`ml-1 ${T.caption} font-normal tabular-nums ${TX.muted}`}
                >
                  /{MAX_PREDICT_TABLE_SCORE}
                </span>
              </th>
              <td
                className={`py-1.5 text-right ${weight(youTotals.total, themTotals.total)}`}
              >
                {youTotals.total}
              </td>
              <td
                className={`py-1.5 text-right ${weight(themTotals.total, youTotals.total)}`}
              >
                {themTotals.total}
              </td>
            </tr>
          </tbody>
        </table>

        <p className={`${T.caption} ${TX.muted}`}>
          <span className="font-bold">Exactly right Bands: </span>
          {exactBandsLine(them.displayName, youTotals, themTotals)}
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
    ? "grid-cols-[5.5rem_1fr_2rem_2rem]"
    : "grid-cols-[2.75rem_1fr_2rem_2rem]";
}

/** A Band's name, positions and any exact-Band chips, for any heading. */
function BandHeading({
  bandIndex,
  youBonus,
  themBonus,
  themName,
  onInk = false,
}: {
  bandIndex: number;
  youBonus: number;
  themBonus: number;
  themName: string;
  onInk?: boolean;
}) {
  const band = TABLE_BANDS[bandIndex];
  const { Icon, positions } = BAND_META[band.key];
  return (
    <>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className={`truncate ${LABEL}`}>{band.label}</span>
      {onInk ? (
        // BandSummary's positions pill on the ink header.
        <span
          className={`shrink-0 rounded-badge bg-paper/15 px-2 py-0.5 ${T.label} font-extrabold tabular-nums ${TX.onInk}`}
        >
          {positions}
        </span>
      ) : (
        <span className={`shrink-0 ${T.caption} font-medium tabular-nums`}>
          {positions}
        </span>
      )}
      {youBonus > 0 || themBonus > 0 ? (
        // Each chip carries its owner's mark, so it never relies on which
        // column it happens to sit above.
        <span className="ml-auto flex shrink-0 gap-1">
          <BandBonusChip who="you" name="You" value={youBonus} />
          <BandBonusChip who="them" name={themName} value={themBonus} />
        </span>
      ) : null}
    </>
  );
}

interface LayoutProps {
  sections: CompareSection[];
  youScore: PredictTableScoreResult;
  themScore: PredictTableScoreResult;
  themName: string;
  seasonOver: boolean;
  options: Options;
  rowFor: (row: CompareRow) => React.ReactNode;
}

/**
 * Q14 "differences": the page answers "why is the gap what it is?" by its
 * structure. Clubs that moved the gap come first, grouped by who gained and
 * biggest swing first; clubs on the same points fold away at the end. The
 * Band each club sits in is still its shaded column.
 */
function DifferencesLayout({
  sections,
  youScore,
  themScore,
  themName,
  seasonOver,
  options,
  rowFor,
}: LayoutProps) {
  const rows = sections.flatMap((s) => s.rows);
  const swing = (r: CompareRow) => r.you.points - r.them.points;
  const youGained = rows
    .filter((r) => swing(r) > 0)
    .sort((a, b) => swing(b) - swing(a));
  const themGained = rows
    .filter((r) => swing(r) < 0)
    .sort((a, b) => swing(a) - swing(b));
  const level = rows.filter((r) => swing(r) === 0);
  const sum = (list: CompareRow[]) =>
    list.reduce((total, r) => total + Math.abs(swing(r)), 0);
  const exactBands = sections.filter(
    (s) =>
      bandBonus(youScore, s.bandIndex) > 0 ||
      bandBonus(themScore, s.bandIndex) > 0,
  );

  const groupHeading = (label: string, amount: number | null) => (
    <div
      className={`flex items-baseline gap-2 border-t border-paper-line ${INSET} pt-3 pb-1 first:border-t-0`}
    >
      <span className={`${LABEL} ${TX.muted}`}>{label}</span>
      {amount !== null ? (
        <span className={`${T.caption} font-extrabold tabular-nums ${TX.base}`}>
          {pointLabel(amount)}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className={`overflow-clip rounded-card bg-surface ${CARD_SHADOW}`}>
      <ChartKey themName={themName} seasonOver={seasonOver} />
      <AxisHeader options={options} />
      {youGained.length > 0 ? (
        <section>
          {groupHeading("Where you gained", sum(youGained))}
          <ul>{youGained.map(rowFor)}</ul>
        </section>
      ) : null}
      {themGained.length > 0 ? (
        <section>
          {groupHeading(`Where ${themName} gained`, sum(themGained))}
          <ul>{themGained.map(rowFor)}</ul>
        </section>
      ) : null}
      {exactBands.length > 0 ? (
        // Band Bonus belongs to a whole Band, not a club, so it can't sit
        // in a club row; it gets its own line in the gap's accounting.
        <section>
          {groupHeading("Exactly right Bands", null)}
          <ul className={`flex flex-col gap-1 ${INSET} pb-2.5`}>
            {exactBands.map((s) => (
              <li
                key={s.bandIndex}
                className={`flex items-center gap-1.5 ${TX.muted}`}
              >
                <BandHeading
                  bandIndex={s.bandIndex}
                  youBonus={bandBonus(youScore, s.bandIndex)}
                  themBonus={bandBonus(themScore, s.bandIndex)}
                  themName={themName}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {level.length > 0 ? (
        // Clubs on the same points don't explain the gap, so they fold
        // away -- still one tap from the full table.
        <details className="group border-t border-paper-line">
          <summary
            className={`flex min-h-11 cursor-pointer list-none items-center gap-2 ${INSET} ${FOCUS}`}
          >
            <span className={`${LABEL} ${TX.muted}`}>Same points</span>
            <span className={`${T.caption} tabular-nums ${TX.muted}`}>
              {level.length} clubs
            </span>
            <ChevronDown
              className="ml-auto size-4 stroke-text-muted transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <ul>{level.map(rowFor)}</ul>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Q14 "cards": each Band is its own card with an ink header, the grammar
 * /predict-table's BandSummary already uses for a table. The marks strip
 * sticks above the whole stack.
 */
function BandCardsLayout({
  sections,
  youScore,
  themScore,
  themName,
  seasonOver,
  options,
  rowFor,
}: LayoutProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className={`overflow-clip rounded-card bg-surface ${CARD_SHADOW}`}>
        <ChartKey themName={themName} seasonOver={seasonOver} />
      </div>
      {/* The sticky marks strip lives outside the cards: CardShell's
          overflow-hidden would trap it. */}
      <div
        className={`sticky top-0 z-10 overflow-clip rounded-btn ${CARD_SHADOW}`}
      >
        <AxisHeader options={options} />
      </div>
      {sections.map((section) => (
        <CardShell key={section.bandIndex} className="bg-surface">
          <div
            className={`flex items-center gap-1.5 bg-ink ${INSET} py-2.5 ${TX.onInk}`}
          >
            <BandHeading
              bandIndex={section.bandIndex}
              youBonus={bandBonus(youScore, section.bandIndex)}
              themBonus={bandBonus(themScore, section.bandIndex)}
              themName={themName}
              onInk
            />
          </div>
          <ul className="py-1">{section.rows.map(rowFor)}</ul>
        </CardShell>
      ))}
    </div>
  );
}

/**
 * An exact-Band bonus, on its Band's heading in the player's points column.
 * Pitch Green as a fill under paper text (DESIGN.md -> Pitch Green): it's
 * an award for the whole Band, so it's set apart from the rows' plain
 * numbers. Nothing renders when the Band wasn't exact -- every heading
 * carrying two zeros would bury the one that matters.
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
      {/* The owner's chart mark, so the chip says whose it is. */}
      {who === "you" ? (
        <YouMark size="size-2.5" />
      ) : (
        <ThemMark size="size-2.5" />
      )}
      <Check className="-ml-0.5 size-3 stroke-[3]" aria-hidden />
      {pointLabel(value)}
      <span className="sr-only">
        {" "}
        for {name}: every club in this Band exactly right
      </span>
    </span>
  );
}

// The chart's marks, drawn once so the key and the column headers use the
// exact shapes the lanes use -- never a glyph standing in for them.
function YouMark({ size = "size-3" }: { size?: string }) {
  return (
    <span
      aria-hidden
      className={`${size} shrink-0 rounded-badge bg-accent ring-1 ring-ink`}
    />
  );
}

function ThemMark({ size = "size-3" }: { size?: string }) {
  return (
    <span
      aria-hidden
      className={`${size} shrink-0 rounded-badge border-2 border-ink bg-surface`}
    />
  );
}

/**
 * The chart's legend, in the role /picks' PicksLegend plays for its
 * columns: what each mark means, at the top of the card. It scrolls away
 * with the card's start; the sticky axis keeps the You/Them marks.
 */
function ChartKey({
  themName,
  seasonOver,
}: {
  themName: string;
  seasonOver: boolean;
}) {
  const item = `flex items-center gap-1.5`;
  return (
    <div
      className={`flex flex-wrap gap-x-4 gap-y-1.5 border-b border-paper-line ${INSET} py-2.5 ${T.caption} ${TX.muted}`}
    >
      <span className={item}>
        <YouMark />
        <span className={`font-bold ${TX.base}`}>You</span>
      </span>
      <span className={item}>
        <ThemMark />
        <span className={`font-bold ${TX.base}`}>{themName}</span>
      </span>
      <span className={item}>
        <span aria-hidden className="h-1.5 w-5 rounded-badge bg-accent" />
        How far off
      </span>
      <span className={item}>
        {/* The finished-Band column and its finish line, in miniature. */}
        <span
          aria-hidden
          className="relative flex h-4 w-3 justify-center rounded-[3px] bg-paper"
        >
          <span className="h-full w-px bg-ink" />
        </span>
        {seasonOver ? "Where it finished" : "Where it is now"}
      </span>
      <span className={item}>
        <Star className={`size-3 fill-current ${TX.base}`} aria-hidden />
        {BOLD_CALL_SHORT}
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

function AxisHeader({ options }: { options: Options }) {
  return (
    // Sticky: once the header scrolls away nothing else names the columns.
    // Same treatment as /picks' sticky PicksLegend.
    <div
      className={`sticky top-0 z-10 grid ${gridCols(options)} items-end gap-1.5 border-b border-paper-line bg-surface ${INSET} py-1.5`}
    >
      {/* No Band labels on the axis (Q11: neither option read at phone
          width). Each section's heading and its shaded column name the
          Band; the tick marks let distance be counted. */}
      <span aria-hidden />
      <span aria-hidden />
      {/* Each points column is headed by its player's mark, so the
          dot-to-player mapping survives scrolling past the key. The key
          names the marks; words don't fit these 40px columns. */}
      <span className="flex justify-end pr-3">
        <YouMark size="size-2.5" />
        <span className="sr-only">You</span>
      </span>
      <span className="flex justify-end pr-3">
        <ThemMark size="size-2.5" />
        <span className="sr-only">Them</span>
      </span>
    </div>
  );
}

const pct = (n: number) => `${String((n * 100) / BAND_COUNT)}%`;
const centre = (band: number) => pct(band + 0.5);

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
        // In the last Band the star goes on the mark's left, so it never
        // crowds the points column.
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

function Row({
  row,
  options,
  seasonOver,
  open,
  onTap,
}: {
  row: CompareRow;
  options: Options;
  seasonOver: boolean;
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
            , {seasonOver ? "finished" : "now"} {ordinal(row.position)}. You{" "}
            {placementReason(row.you, row.actualBand)}
            {row.you.boldCall ? ", plus a Bold Call" : ""}. Them{" "}
            {placementReason(row.them, row.actualBand)}
            {row.them.boldCall ? ", plus a Bold Call" : ""}.
          </span>
        </span>

        <span className="relative h-11" aria-hidden>
          {/* The Band these clubs finished in (paper, the app's ground), with
              its finish line down the centre. */}
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

        <PointsCell call={row.you} theirs={row.them.points} options={options} />
        <PointsCell call={row.them} theirs={row.you.points} options={options} />
      </button>
    </li>
  );
}

function PointsCell({
  call,
  theirs,
  options,
}: {
  call: SideCall;
  theirs: number;
  options: Options;
}) {
  const mine = call.points;
  return (
    // `+5` / `0` through the app's own pointLabel (DESIGN.md -> Do's). A
    // Bold Call is folded in (`+8★`); the star slot is always reserved so
    // digits stay in one column (DESIGN.md -> Steady Digits).
    <span
      className={`flex items-center justify-end gap-0.5 ${T.caption} tabular-nums ${emphasis(mine, theirs, options)}`}
      aria-hidden
    >
      {pointLabel(mine)}
      <span className="flex w-2.5 justify-center">
        {call.boldCall ? (
          <Star className="size-2.5 fill-current" aria-hidden />
        ) : null}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------

function TapCard({
  row,
  themName,
  options,
  seasonOver,
  onHeight,
  onClose,
}: {
  row: CompareRow;
  themName: string;
  options: Options;
  seasonOver: boolean;
  onHeight: (height: number) => void;
  onClose: () => void;
}) {
  const band = TABLE_BANDS[row.actualBand];
  const cardRef = useRef<HTMLDivElement>(null);

  // The design keeps the tapped row visible above the docked card, so once
  // the card has rendered (its height varies with its content) lift the row
  // clear of it if it landed underneath.
  useEffect(() => {
    const card = cardRef.current?.getBoundingClientRect();
    if (card) onHeight(card.height);
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
  }, [row.teamId, onHeight]);

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
                actualBand={row.actualBand}
                theirs={row.them.points}
                options={options}
              />
              <ScoreTile
                name={themName}
                who="them"
                call={row.them}
                actualBand={row.actualBand}
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
          // One line, with an en dash (stacked ranges read as fractions),
          // and only for the Bands this card is about: where the club is
          // and the two calls. The ticks already mark every other Band.
          <span
            key={band.key}
            className={`whitespace-nowrap text-center ${T.label} tracking-[-0.04em] tabular-nums ${
              index === row.actualBand
                ? `font-extrabold ${TX.base}`
                : `font-bold ${TX.muted}`
            }`}
          >
            {index === row.actualBand ||
            index === row.you.band ||
            index === row.them.band
              ? BAND_META[band.key].positions.replace("-", "–")
              : null}
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
  actualBand,
  theirs,
  options,
}: {
  name: string;
  who: "you" | "them";
  call: SideCall;
  actualBand: number;
  theirs: number;
  options: Options;
}) {
  const parts = breakdown(call, actualBand);
  const lead = leads(call.points, theirs, options);
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
        className={`${T.h2} leading-none tabular-nums ${
          call.points === 0
            ? `font-bold ${TX.muted}`
            : lead
              ? `font-extrabold ${TX.base}`
              : `font-bold ${TX.base}`
        }`}
      >
        {pointLabel(call.points)}
      </span>
      {/* How the figure is made, as one equation: a Bold Call is inside the
          number above, never a second addition on top of it. */}
      <span className={`${T.caption} leading-snug ${TX.muted}`}>
        {parts.placement}
        {parts.boldCall ? (
          <span className={`font-bold ${TX.base}`}>
            {" · "}
            <Star
              className="mb-0.5 inline size-3 fill-current"
              aria-hidden
            />{" "}
            {parts.boldCall}
          </span>
        ) : null}
      </span>
      {/* Wraps rather than truncates: the Band name is the tile's answer
          to "what did they say". */}
      <span className={`${T.caption} font-bold leading-snug ${TX.base}`}>
        {call.band === null
          ? "Not placed"
          : `Said ${TABLE_BANDS[call.band].label}`}
      </span>
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
