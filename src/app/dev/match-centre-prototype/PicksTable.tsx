"use client";

// ONE picks table, two lengths -- home's recap and the season record.
//
// Fixed in review:
//   * the legend's columns didn't line up with the row they label. Its
//     flex-1 span sat over the FIXTURE column, so the one device whose job
//     is "stop 1-0  0-1 being read the wrong way round" was not above the
//     numbers it disambiguates. Same five-cell skeleton now.
//   * the legend said "your pick" on someone else's record; it now just
//     says "pick", which is true on every record and fits on one line.
//   * the pick cell rendered a dash for "you didn't pick" -- the same glyph
//     that also meant not-played, no-points, no-movement and no-gap. It now
//     says `no pick`, in words.
//   * "No picks" was shown whenever a week scored nothing, so a week that
//     was called off, or simply hasn't finished, accused the player of not
//     picking. The states are computed separately now.
//   * `1 PTS`.

import { ChevronRight } from "lucide-react";
import type { PickLine } from "./season";
import {
  LABEL,
  T_CAPTION,
  TEXT,
  TEXT_MUTED,
  TEXT_FAINT,
  pointTone,
  pointLabel,
} from "./shared";

// Just "pick" -- "your pick" / "Grace's pick" wrapped to two lines, and the
// possessive is already established by the card's own header. One line, and
// the columns tighten to what a scoreline actually needs, which hands the
// slack back to the fixture column.
const COL_PICK = "w-11 text-right";
const COL_FINAL = "w-11 text-right";
const COL_PTS = "w-7 text-right";

export function PicksLegend() {
  return (
    <span className={`flex items-baseline gap-3 ${LABEL} ${TEXT_FAINT}`}>
      <span className="min-w-0 flex-1" />
      <span className={COL_PICK}>pick</span>
      <span className={COL_FINAL}>final</span>
      <span className={COL_PTS}>pts</span>
    </span>
  );
}

export function PicksRow({ line }: { line: PickLine }) {
  const calledOff = line.kind === "voided";
  return (
    <li className={`flex items-baseline gap-3 ${T_CAPTION}`}>
      <span className="min-w-0 flex-1 truncate">
        <span className={`font-bold ${TEXT}`}>{line.homeCode}</span>
        <span className={TEXT_FAINT}> v </span>
        <span className={`font-medium ${TEXT_MUTED}`}>{line.awayCode}</span>
      </span>
      <span className={`${COL_PICK} tabular-nums ${TEXT_MUTED}`}>
        {!line.locked ? (
          ""
        ) : line.pick ? (
          `${line.pick.home}–${line.pick.away}`
        ) : (
          <span className={`font-medium not-italic ${TEXT_FAINT}`}>
            no pick
          </span>
        )}
      </span>
      <span
        className={`${COL_FINAL} font-bold tabular-nums ${
          calledOff ? TEXT_MUTED : TEXT
        }`}
      >
        {calledOff
          ? "off"
          : line.result
            ? `${line.result.home}–${line.result.away}`
            : ""}
      </span>
      <span className={`${COL_PTS} tabular-nums ${pointTone(line.points)}`}>
        {pointLabel(line.points)}
      </span>
    </li>
  );
}

/** What a week's total says when there is no total. Four different facts
 *  that all used to render as "No picks". */
export type WeekState =
  | { kind: "scored"; total: number; pending?: boolean }
  | { kind: "no_picks" }
  | { kind: "not_scored" }
  | { kind: "called_off" };

export function WeekHeading({
  gameweek,
  dateLabel,
  state,
  chevron,
}: {
  gameweek: number;
  dateLabel?: string;
  state: WeekState;
  chevron?: boolean;
}) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className={`${LABEL} ${TEXT_MUTED}`}>
        Gameweek {gameweek}
        {dateLabel ? (
          <span
            className={`ml-2 font-medium normal-case tracking-normal ${TEXT_FAINT}`}
          >
            {dateLabel}
          </span>
        ) : null}
      </span>
      <span className="flex items-baseline gap-1">
        {state.kind === "scored" ? (
          <>
            <span
              className={`text-[1.0625rem] font-extrabold leading-none tabular-nums ${
                state.total > 0 ? TEXT : TEXT_MUTED
              }`}
            >
              {state.total}
            </span>
            <span className={`${LABEL} ${TEXT_MUTED}`}>
              {state.total === 1 ? "pt" : "pts"}
              {state.pending ? " so far" : ""}
            </span>
          </>
        ) : (
          <span className={`${LABEL} ${TEXT_MUTED}`}>
            {state.kind === "no_picks"
              ? "You missed this one"
              : state.kind === "called_off"
                ? "Called off"
                : "Not scored yet"}
          </span>
        )}
        {chevron ? (
          <ChevronRight className="ml-0.5 size-3.5 stroke-ink/70" aria-hidden />
        ) : null}
      </span>
    </span>
  );
}
