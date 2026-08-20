"use client";

// The three non-home surfaces. Rewritten after design review; see shared.tsx
// for the house style every one of them now follows.

import { scoreMatch } from "@/lib/scoring/match";
import { PLAYER_BY_ID, PLAYERS, SIGNED_IN, type ProtoMatch } from "./fixture";
import {
  seasonFor,
  matchesForGameweek,
  pointsFor,
  pickFor,
  BOARD,
  CURRENT_GW,
  joinGameweek,
  LATE_JOIN_GW,
  toPickLine,
} from "./season";
import { GameweekStrip } from "./GameweekStrip";
import { ProtoMatchCard } from "./ProtoMatchCard";
import { LeaderboardList } from "./ProtoLeaderboardRow";
import {
  AuditLine,
  PlayerChip,
  Points,
  Shell,
  LABEL,
  FOCUS,
  INSET,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_SCORE,
  TEXT,
  TEXT_MUTED,
  TEXT_FAINT,
  ON_INK,
  ON_INK_MUTED,
} from "./shared";
import { PicksLegend, PicksRow, WeekHeading } from "./PicksTable";

// ---------------------------------------------------------------------------
// Match axis -- the reveal
// ---------------------------------------------------------------------------

function clusters(match: ProtoMatch) {
  const map = new Map<string, { home: number; away: number; ids: string[] }>();
  const none: string[] = [];
  for (const pick of match.picks) {
    if (pick.home === null || pick.away === null) {
      none.push(pick.playerId);
      continue;
    }
    const key = `${pick.home}-${pick.away}`;
    const existing = map.get(key);
    if (existing) existing.ids.push(pick.playerId);
    else
      map.set(key, { home: pick.home, away: pick.away, ids: [pick.playerId] });
  }
  const resultKey = match.result
    ? `${match.result.home}-${match.result.away}`
    : null;

  // SETTLED: correct-first, then crowd size. Before a result exists this
  // falls through to crowd size on its own, so the list reshuffles exactly
  // once -- when the result lands.
  const list = [...map.values()].sort((a, b) => {
    if (resultKey) {
      const aPts = pointsForScoreline(match, a.home, a.away);
      const bPts = pointsForScoreline(match, b.home, b.away);
      if (aPts !== bPts) return bPts - aPts;
    }
    return b.ids.length - a.ids.length;
  });

  // Within a cluster: you first, then people alphabetically, then bots.
  // Previously this was fixture order, i.e. arbitrary, so your own chip
  // could be fifth on the second line of a three-line wrap.
  for (const cluster of list) {
    cluster.ids.sort((a, b) => {
      if (a === SIGNED_IN) return -1;
      if (b === SIGNED_IN) return 1;
      const pa = PLAYER_BY_ID.get(a)!;
      const pb = PLAYER_BY_ID.get(b)!;
      if (pa.isBot !== pb.isBot) return pa.isBot ? 1 : -1;
      return pa.name.localeCompare(pb.name);
    });
  }
  return { list, none, resultKey };
}

/**
 * Points for a hypothetical scoreline. Calls the REAL engine -- this used to
 * be a hand-rolled reimplementation that omitted both team-score terms, so
 * the reveal could never render a 4, and the same match showed one number in
 * home's recap and a different one here, one tap away. There is exactly one
 * scoring implementation in this app and every surface calls it.
 */
function pointsForScoreline(match: ProtoMatch, home: number, away: number) {
  if (!match.result) return 0;
  return scoreMatch(home, away, match.result.home, match.result.away).points;
}

function chipTone(id: string) {
  if (id === SIGNED_IN) return "you" as const;
  return PLAYER_BY_ID.get(id)!.isBot ? ("bot" as const) : ("human" as const);
}

export function Reveal({ match }: { match: ProtoMatch }) {
  const { list, none, resultKey } = clusters(match);
  const voided = match.kind === "voided";
  const settled = !!match.result;

  return (
    <ProtoCard match={match}>
      <AuditLine match={match} />

      {voided ? (
        <p className={`bg-white ${INSET} py-3 ${T_CAPTION} ${TEXT_MUTED}`}>
          Called off after picks closed — nobody scored on this one.
          Everyone&apos;s picks are still below.
        </p>
      ) : !settled ? (
        <p className="bg-white px-4 py-3 text-[0.8rem] text-ink/60">
          Everyone&apos;s in. Picks are locked — kick-off is{" "}
          {match.kickoffLabel}.
        </p>
      ) : null}

      {/* Direction is stated, not implied (DESIGN_SYSTEM.md -> Team display
          in fixtures). The header states it vertically; the clusters state
          it inline, so the reader has to rotate the axis 90 degrees -- and
          this fixture deliberately contains a Wrong Way Round pick, the one
          case where reading it backwards inverts the meaning. */}
      {/* Direction is stated, not implied. A middot conveyed even less than
          "v", on the one screen whose fixture deliberately contains a Wrong
          Way Round pick. */}
      <div
        className={`flex items-baseline justify-between border-b border-paper-line bg-white ${INSET} py-1.5 ${LABEL} ${TEXT_FAINT}`}
      >
        <span>
          {match.home.shortCode} (home) v {match.away.shortCode}
        </span>
        <span>who picked it</span>
      </div>

      <ul className="flex flex-col divide-y divide-paper-line bg-white">
        {list.map((cluster) => {
          const key = `${cluster.home}-${cluster.away}`;
          const hit = key === resultKey;
          const mine = cluster.ids.includes(SIGNED_IN);
          const points = settled
            ? pointsForScoreline(match, cluster.home, cluster.away)
            : null;
          const wrongWayRound =
            !!match.result &&
            cluster.home === match.result.away &&
            cluster.away === match.result.home &&
            cluster.home !== cluster.away;
          return (
            <li
              key={key}
              className={`relative flex gap-3 px-4 py-3 ${hit ? "bg-success/10" : ""}`}
            >
              {/* Own-row findability is an accent stripe on the left edge --
                  the treatment ADR 0012 D7 settled for exactly this problem.
                  Inside the budget: this row IS the player's own predicted
                  scoreline, DESIGN_SYSTEM.md:21's sanctioned spot #2. */}
              {mine ? (
                <span
                  className="absolute inset-y-0 left-0 w-1 bg-accent"
                  aria-hidden
                />
              ) : null}
              {/* The scoreline is a FACT and is always full-strength ink.
                  It used to be tinted by pointTone, so a real scoreline three
                  players submitted rendered at 1.98:1 -- and the verdict was
                  already stated twice on the row (the points value, the row
                  tint). Three encodings of one fact, the third costing
                  legibility of a different one. */}
              <div className="flex w-14 shrink-0 flex-col items-center gap-1">
                <span
                  className={`${T_SCORE} font-extrabold leading-none tabular-nums ${TEXT}`}
                >
                  {cluster.home}–{cluster.away}
                </span>
                {settled ? <Points points={points} /> : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <ul className="flex flex-wrap items-start gap-1.5">
                  {cluster.ids.map((id) => (
                    <li key={id}>
                      <PlayerChip
                        player={PLAYER_BY_ID.get(id)!}
                        tone={chipTone(id)}
                      />
                    </li>
                  ))}
                </ul>
                {/* The friendliest rule in the game, and previously its most
                    invisible pixel: a bare +1 in the second-faintest tone. */}
                {wrongWayRound ? (
                  <span className={`${T_LABEL} ${TEXT_MUTED}`}>
                    Wrong way round! It finished {match.result!.home}–
                    {match.result!.away}. That&apos;s worth a point.
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {/* One warm sentence, not a wall of avatars under "NO PICK". ADR 0013
          D6 sanctions naming non-filers PRE-lock, as a nudge with an action
          attached; this is the permanent, deep-linked archive, where the
          same list is just a monument to two kids missing a week. */}
      {/* "Sat this one out" implies a choice, and bots/pre-join players used
          to land here -- states that can't happen in the real product. */}
      {none.length > 0 ? (
        <p className={`bg-white ${INSET} py-2.5 ${T_LABEL} ${TEXT_MUTED}`}>
          No pick from {formatNames(none)} this week.
        </p>
      ) : null}
    </ProtoCard>
  );
}

function formatNames(ids: string[]) {
  const names = ids.map((id) => PLAYER_BY_ID.get(id)!.name);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function ProtoCard({
  match,
  children,
}: {
  match: ProtoMatch;
  children: React.ReactNode;
}) {
  const state =
    match.kind === "voided" ? "voided" : match.result ? "final" : "locked";
  return (
    <ProtoMatchCard
      match={match}
      state={state}
      scores={
        match.result
          ? { home: match.result.home, away: match.result.away }
          : undefined
      }
    >
      {children}
    </ProtoMatchCard>
  );
}

export function GameweekSurface({
  gw,
  onGw,
}: {
  gw: number;
  onGw: (n: number) => void;
}) {
  const matches = matchesForGameweek(gw);
  return (
    <div className="flex flex-col gap-4">
      <GameweekStrip active={gw} onSelect={onGw} />
      {matches.map((match) => (
        <Reveal key={match.id} match={match} />
      ))}
      {matches.length === 1 ? (
        <p className="px-1 text-[0.8rem] text-ink/60">
          One match this week — the other was called off before picks locked.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player axis
// ---------------------------------------------------------------------------

export function LeaderboardSurface({
  onOpenRecord,
}: {
  onOpenRecord: (playerId: string) => void;
}) {
  return <LeaderboardList rows={BOARD} onOpenRecord={onOpenRecord} />;
}

/**
 * A picks record -- ADR 0013 D9: emoji, display name, picks, points, and
 * nothing else. No rank, no streaks, no charts, no head-to-head, and no
 * "N agreed" (a cohort statistic, which is also what D2 keeps the archive
 * cheap by not reading). The crowd question has a better door: the gameweek
 * divider links to the reveal, where clusters answer it with faces.
 *
 * One card for the whole season, not one per gameweek: 38 ink headers and 38
 * lift-shadows down a single scroll is a breach of both "grouped by gameweek,
 * collapsible" and "shadow applied to cards, not to every element".
 */
export function RecordSurface({
  playerId,
  onOpenGameweek,
}: {
  playerId: string;
  onOpenGameweek: (gw: number) => void;
}) {
  const player = PLAYERS.find((p) => p.id === playerId) ?? PLAYERS[0];
  const season = seasonFor(player.id);
  const you = player.id === SIGNED_IN;
  const total = season.reduce((a, w) => a + (w.total ?? 0), 0);
  const late = joinGameweek(player.id) > 1;

  return (
    <div className="flex flex-col gap-4">
      <Shell>
        <div
          className={`flex items-center gap-3 bg-ink ${INSET} py-3.5 ${ON_INK}`}
        >
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-full text-lg ${
              player.isBot ? "bg-ink/40" : "bg-paper"
            }`}
            aria-hidden
          >
            {player.emoji}
          </span>
          <span className={`flex-1 ${T_BODY} font-bold`}>
            {you ? "Your picks" : `${player.name}'s picks`}
          </span>
          <span className="flex flex-col items-end leading-none">
            <span className="text-[1.75rem] font-extrabold tabular-nums">
              {total}
            </span>
            <span className={`${LABEL} ${ON_INK_MUTED}`}>points</span>
          </span>
        </div>
      </Shell>

      {/* The archive's jump control, reused rather than reinvented: it scrolls
          to a week WITHIN this record. The week heading's own chevron already
          owns "take me to the reveal" -- two jobs, two controls, no overlap. */}
      <GameweekStrip
        active={season[0]?.gameweek ?? CURRENT_GW}
        onSelect={(gw) => {
          document
            .getElementById(`rec-gw-${gw}`)
            ?.scrollIntoView({ block: "start", behavior: "smooth" });
        }}
      />

      <Shell>
        {/* Sticky: the legend exists because "1-0  0-1" can be read the wrong
            way round, and it used to scroll away after the first screenful of
            a 2,000px card -- gone for 90% of the thing it disambiguates. */}
        <div
          className={`sticky top-0 z-10 border-b border-paper-line bg-white ${INSET} py-1.5`}
        >
          <PicksLegend />
        </div>

        <ol className="flex flex-col bg-white">
          {season.map((week) => (
            <li key={week.gameweek} id={`rec-gw-${week.gameweek}`}>
              {/* Heading-only target. An 82px full-width button repeated 24
                  times down a 2,000px scroll means a scroll that ends in a
                  slight tap navigates away from the position you just worked
                  to reach. Same grammar as ADR 0011's Band headers. */}
              <button
                onClick={() => onOpenGameweek(week.gameweek)}
                className={`flex w-full flex-col border-t border-paper-line ${INSET} py-2 text-left first:border-t-0 ${FOCUS}`}
              >
                <WeekHeading
                  gameweek={week.gameweek}
                  dateLabel={week.dateLabel}
                  state={week.outcome}
                  chevron
                />
              </button>
              <ul className={`flex flex-col gap-1 ${INSET} pb-2.5`}>
                {week.entries.map((e) => (
                  <PicksRow key={e.match.id} line={toPickLine(e)} />
                ))}
              </ul>
              {week.entries.some((e) => e.match.kind === "voided") ? (
                <p className={`${INSET} pb-2.5 ${T_LABEL} ${TEXT_MUTED}`}>
                  Called off after picks closed — nobody scored on this one.
                </p>
              ) : null}
              {week.entries.length === 1 ? (
                <p className={`${INSET} pb-2.5 ${T_LABEL} ${TEXT_MUTED}`}>
                  Only one match this week — the other was called off before
                  picks opened.
                </p>
              ) : null}
            </li>
          ))}
        </ol>

        {late ? (
          <p
            className={`border-t border-paper-line bg-white ${INSET} py-2.5 ${T_LABEL} ${TEXT_MUTED}`}
          >
            Joined at Gameweek {LATE_JOIN_GW}.
          </p>
        ) : null}
      </Shell>
    </div>
  );
}

export { CURRENT_GW, pointsFor, pickFor };
