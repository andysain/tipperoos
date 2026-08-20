"use client";

// HOME. Rewritten after review.
//
// SUMMARY AT THE TOP -- Andy's call, made with the alternative on screen.
// The measured cost is real and worth recording: a review found that with
// the summary above the slots, card 2's digit rows land around y 850-990 on
// a pre-lock visit, so half the entry controls need a deliberate scroll.
// Three changes since that measurement claw most of it back -- home's
// redundant H1 is gone (-54px), the summary is one card lighter, and the
// legend no longer wraps -- but the ordering is a deliberate choice against
// "picks first", not an oversight. Worth re-measuring on a real device.
//
// Also fixed:
//   * home's H1 restated the tab you're standing on. "Gameweek 24" is the
//     true title of this surface and it changes weekly.
//   * the deadline -- the only reason to act now -- was the quietest text on
//     the page. It's a peer of the title, and each card carries its own
//     close time, because the two matches have different kickoffs.
//   * "Tap a score for each team" appeared twice; it's an instruction for
//     the interaction, not for either card.
//   * day one hid the Predict the Table strip entirely, so the onboarding
//     task was invisible on the only screen a new player had seen.
//   * the strip was a bordered flat card (a third card shape the design
//     system forbids), filled with `info` (a category token) on a bar that
//     reads as progress toward a fixed goal, which it isn't.

import { ChevronRight } from "lucide-react";
import { ProtoMatchCard } from "./ProtoMatchCard";
import { ScoreEntry } from "./ScoreEntry";
import { SummaryRow } from "./SummaryRow";
import {
  CURRENT_GW,
  TABLE_SCORE,
  matchesForGameweek,
  pickFor,
  pointsFor,
} from "./season";
import { SIGNED_IN } from "./fixture";
import {
  LABEL,
  FOCUS,
  INSET,
  CARD_SHADOW,
  T_CAPTION,
  T_H1,
  TEXT,
  TEXT_MUTED,
  ordinal,
} from "./shared";
import type { Phase } from "./page";

const BOARD_MATCHES = matchesForGameweek(CURRENT_GW);
const PICKS = BOARD_MATCHES.map(
  (m) => pickFor(m, SIGNED_IN) ?? { home: 2, away: 1 },
);
const CLOSES = ["Sat 11:25 pm", "Sun 1:55 am"];

// Trimmed hard: two full sentences plus a caption was more prose than any
// other block on the page, for a once-a-season feature. The number leads,
// one short line supports it.
function TableStrip({
  started,
  onOpen,
}: {
  started: boolean;
  onOpen: () => void;
}) {
  if (!started) {
    return (
      <button
        onClick={onOpen}
        className={`flex items-center justify-between gap-3 rounded-card bg-accent ${INSET} py-3 text-left text-accent-ink ${CARD_SHADOW} ${FOCUS}`}
      >
        <span className="flex flex-col gap-0.5">
          <span className={`${LABEL} opacity-70`}>Next up</span>
          <span className={`${T_CAPTION} font-bold`}>
            Pick where all 20 teams will finish.
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0" aria-hidden />
      </button>
    );
  }
  return (
    <button
      onClick={onOpen}
      className={`flex items-center gap-3 rounded-card bg-white ${INSET} py-3 text-left ${CARD_SHADOW} ${FOCUS}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`${LABEL} ${TEXT_MUTED}`}>Predict the Table</span>
        <span className={`${T_CAPTION} ${TEXT_MUTED}`}>
          Your champion {TABLE_SCORE.champion} is{" "}
          {ordinal(TABLE_SCORE.championPosition)}
        </span>
      </div>
      <span className="flex shrink-0 items-baseline gap-1">
        <span
          className={`text-[1.0625rem] font-extrabold tabular-nums ${TEXT}`}
        >
          {TABLE_SCORE.points}
        </span>
        <span className={`${LABEL} ${TEXT_MUTED}`}>/{TABLE_SCORE.max}</span>
      </span>

      <ChevronRight className="size-4 shrink-0 stroke-ink/70" aria-hidden />
    </button>
  );
}

export function HomeSurface({
  phase,
  recapGw,
  empty,
  go,
}: {
  phase: Phase;
  recapGw?: number;
  empty: boolean;
  go: (target: string, gw?: number) => void;
}) {
  const next = phase === "next";
  // `part_played` is the state the prototype was missing: the gameweek isn't
  // over, but one of its two matches has finished. Real and common -- the two
  // tipped matches routinely kick off a day apart.
  const partPlayed = phase === "part_played";
  const locked = phase === "locked" || partPlayed;
  const boardGw = next ? CURRENT_GW + 1 : CURRENT_GW;
  const unfiled = phase === "entry";

  return (
    <div className="flex flex-col gap-4">
      {!empty ? (
        <SummaryRow
          recapGw={recapGw ?? (next ? CURRENT_GW : CURRENT_GW - 1)}
          go={go}
        />
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className={`${T_H1} font-extrabold leading-tight ${TEXT}`}>
            Gameweek {boardGw}
          </h1>
          {!locked ? (
            <span className={`${T_CAPTION} font-bold ${TEXT}`}>
              Picks close {CLOSES[0]}
            </span>
          ) : partPlayed ? (
            <span className={`${T_CAPTION} ${TEXT_MUTED}`}>
              One match still to play
            </span>
          ) : (
            <span className={`${T_CAPTION} ${TEXT_MUTED}`}>Picks closed</span>
          )}
        </div>

        {unfiled ? (
          <p className={`${T_CAPTION} ${TEXT_MUTED}`}>
            Tap a score for each team.
          </p>
        ) : null}

        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start">
          {BOARD_MATCHES.map((match, i) => {
            // In a half-played week the finished card shows the RESULT and
            // your points; the unplayed one still shows your pick.
            const done = partPlayed && match.result !== null;
            return (
              <ProtoMatchCard
                key={match.id}
                match={match}
                state={done ? "final" : locked ? "locked" : "open"}
                scores={
                  done
                    ? { home: match.result!.home, away: match.result!.away }
                    : locked
                      ? PICKS[i]
                      : undefined
                }
                closesLabel={CLOSES[i]}
                ownPick={done ? PICKS[i] : undefined}
                ownPoints={done ? pointsFor(match, SIGNED_IN) : undefined}
              >
                {locked ? null : (
                  <ScoreEntry
                    homeCode={match.home.shortCode}
                    awayCode={match.away.shortCode}
                    initial={phase === "filed" ? PICKS[i] : undefined}
                  />
                )}
              </ProtoMatchCard>
            );
          })}
        </div>

        {locked ? (
          <button
            onClick={() => go("gameweek", CURRENT_GW)}
            className={`flex min-h-11 items-center justify-between rounded-btn bg-ink px-3.5 text-paper ${FOCUS}`}
          >
            <span className={`${T_CAPTION} font-bold`}>
              See everyone&apos;s picks
            </span>
            <ChevronRight className="size-4" aria-hidden />
          </button>
        ) : null}
      </section>

      <TableStrip started={!empty} onOpen={() => go("table")} />
    </div>
  );
}
