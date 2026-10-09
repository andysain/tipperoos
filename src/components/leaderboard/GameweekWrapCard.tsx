"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { EmojiChip } from "@/components/ui/PlayerChip";
import { YouPill } from "@/components/ui/YouPill";
import {
  CARD_SHADOW,
  FOCUS,
  INSET,
  LABEL,
  MICRO_LABEL,
  T,
  TX,
} from "@/components/ui/tokens";
import { ordinal } from "@/lib/format/ordinal";
import type { GameweekWrap, WrapAward } from "@/lib/leaderboard/wrap";

// The Gameweek wrap (issue #218, design comment of 2026-10-09): one
// programme-style card, not a card per award, so a week of four awards
// costs the ranking one ~72px header rather than ~300px. It always starts
// collapsed -- the page's subject is the ranking (ADR 0012) -- and is the
// same at every width (#218 D9).

export interface WrapPerson {
  displayName: string;
  emoji: string | null;
}

type Kind = WrapAward["kind"];

/** Award marks are the "awards" emoji tier (docs/DESIGN_SYSTEM.md -> Icons):
 *  celebration, never chrome, so each is aria-hidden behind its name. */
const AWARD_META: Record<Kind, { mark: string; name: string }> = {
  tipper: { mark: "🏆", name: "Tipper of the Week" },
  topOfTheHill: { mark: "👑", name: "Top of the Hill" },
  onFire: { mark: "🔥", name: "On Fire" },
  rocket: { mark: "🚀", name: "Rocket" },
  streakSnapped: { mark: "🧊", name: "Streak Snapped" },
  furthestOff: { mark: "😬", name: "Furthest Off" },
};

interface WinnerLine {
  playerId: string;
  fact: string;
}

/** Copy lives here, not in the pure module (#218 L12). Furthest Off points
 *  at the pick, never the person (D6). */
function winnerLines(award: WrapAward): WinnerLine[] {
  switch (award.kind) {
    case "tipper":
      return award.winners.map((w) => ({
        playerId: w.playerId,
        fact: w.onlyCall
          ? `+${w.points}pts · the only one to call ${w.onlyCall.home}–${w.onlyCall.away}`
          : `+${w.points}pts`,
      }));
    case "topOfTheHill":
      return award.winners.map((w) => ({
        playerId: w.playerId,
        fact: w.jointTop ? "Joint top of the table" : "Top of the table",
      }));
    case "onFire":
      return award.winners.map((w) => ({
        playerId: w.playerId,
        fact: w.newRecord
          ? `${w.streakLength} right results in a row, a new season record`
          : `${w.streakLength} right results in a row`,
      }));
    case "rocket":
      return award.winners.map((w) => ({
        playerId: w.playerId,
        fact: `Up ${w.placesClimbed} places to ${ordinal(w.newRank)}`,
      }));
    case "streakSnapped":
      return award.winners.map((w) => ({
        playerId: w.playerId,
        fact: w.stillSeasonBest
          ? `A run of ${w.endedAt} ended in ${w.homeTeam} v ${w.awayTeam}, still the season best`
          : `A run of ${w.endedAt} ended in ${w.homeTeam} v ${w.awayTeam}`,
      }));
    case "furthestOff":
      return award.winners.map((w) => ({
        playerId: w.playerId,
        // No 😅 here, though #218 D6's example has one: emoji are only
        // personal or award marks (DESIGN_SYSTEM.md -> Icons), and the 😬
        // mark already sets the tone.
        fact: `${w.homeTeam} v ${w.awayTeam}: said ${w.pick.home}–${w.pick.away}, finished ${w.result.home}–${w.result.away}`,
      }));
  }
}

/** "Mia", "Mia and Sam", "Mia, Sam and Jo". */
function joinNames(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Tipper of the Week's "next best" line, under a single winner. */
function nextBestLine(
  award: WrapAward,
  people: Readonly<Record<string, WrapPerson>>,
): string | null {
  if (award.kind !== "tipper" || award.nextBest === null) return null;
  const names = award.nextBest.playerIds.map(
    (id) => people[id]?.displayName ?? "A player",
  );
  return `${joinNames(names)} next best with ${award.nextBest.points}pts`;
}

/** Per player, so each member of a household on one phone gets their own
 *  "New" (#218 L14). */
function seenKey(viewerId: string): string {
  return `tipperoos.wrap-seen.${viewerId}`;
}

/** The last gameweek this player opened ("" if none); `undefined` when
 *  storage can't be read at all. */
function readSeen(viewerId: string): string | undefined {
  try {
    return window.localStorage.getItem(seenKey(viewerId)) ?? "";
  } catch {
    return undefined;
  }
}

export function GameweekWrapCard({
  wrap,
  people,
  viewerId,
}: {
  wrap: GameweekWrap;
  people: Readonly<Record<string, WrapPerson>>;
  viewerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [openedNow, setOpenedNow] = useState(false);
  const week = String(wrap.gameweekNumber);
  // `undefined` on the server and when storage can't be read: no chip at
  // all, rather than one that never clears. Shown only after mount, in
  // space the header already reserves, so nothing shifts.
  const seen = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () => readSeen(viewerId),
    () => undefined,
  );
  const isNew = seen !== undefined && seen !== week && !openedNow;

  if (wrap.shown.length === 0) return null;

  const toggle = () => {
    setOpen((current) => !current);
    if (!openedNow) {
      setOpenedNow(true);
      try {
        window.localStorage.setItem(seenKey(viewerId), week);
      } catch {
        // Storage blocked: the chip already hid for this visit, which is
        // all that can be done.
      }
    }
  };

  const bodyId = `gameweek-wrap-${week}`;
  const count = wrap.shown.length;

  return (
    <section
      className={`overflow-hidden rounded-card bg-surface ${CARD_SHADOW}`}
    >
      <button
        type="button"
        // Names the award marks, which are aria-hidden (DESIGN_SYSTEM.md ->
        // Icons: an award's meaning is carried in text, never the emoji).
        aria-label={`Gameweek ${wrap.gameweekNumber} wrap, ${count} ${
          count === 1 ? "award" : "awards"
        }: ${wrap.shown.map((a) => AWARD_META[a.kind].name).join(", ")}${
          isNew ? ", new" : ""
        }`}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
        className={`flex min-h-11 w-full flex-col gap-1.5 bg-ink ${INSET} py-3 text-left ${FOCUS}`}
      >
        <span className="flex w-full items-center gap-2">
          <span className={`${LABEL} ${TX.onInk}`}>
            Gameweek {wrap.gameweekNumber} wrap
          </span>
          {isNew ? (
            <span
              className={`ml-auto shrink-0 rounded-badge bg-paper/15 px-2 py-0.5 ${MICRO_LABEL} ${TX.onInk}`}
            >
              New
            </span>
          ) : null}
        </span>
        <span className="flex w-full items-center gap-2">
          <span className={`${T.body} leading-none`} aria-hidden>
            {wrap.shown.map((award) => AWARD_META[award.kind].mark).join(" ")}
          </span>
          <span className={`${T.caption} ${TX.onInkMuted}`}>
            {count} {count === 1 ? "award" : "awards"}
          </span>
          <ChevronDown
            // No transition: the wrap has no motion (#218 Scope).
            className={`ml-auto size-4 shrink-0 stroke-on-ink-muted ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </span>
      </button>

      {open ? (
        <ul id={bodyId} className="divide-y divide-paper-line">
          {wrap.shown.map((award) => {
            const nextBest = nextBestLine(award, people);
            return (
              <li
                key={award.kind}
                className={`flex flex-col gap-2 ${INSET} py-3`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={T.body} aria-hidden>
                    {AWARD_META[award.kind].mark}
                  </span>
                  <span className={`${LABEL} ${TX.base}`}>
                    {AWARD_META[award.kind].name}
                  </span>
                </span>
                <ul className="flex flex-col gap-2">
                  {winnerLines(award).map((line) => {
                    const person = people[line.playerId];
                    return (
                      <li
                        key={line.playerId}
                        className="flex items-center gap-2"
                      >
                        <EmojiChip emoji={person?.emoji ?? null} />
                        <span className="flex min-w-0 flex-col">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`truncate ${T.dense} font-bold ${TX.base}`}
                            >
                              {person?.displayName ?? "A player"}
                            </span>
                            {line.playerId === viewerId ? (
                              // Ink, not gold: the list's own gold You badge
                              // is usually on screen too (Accent Budget Rule).
                              <YouPill tone="ink" />
                            ) : null}
                          </span>
                          <span
                            className={`${T.caption} tabular-nums ${TX.muted}`}
                          >
                            {line.fact}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {nextBest !== null ? (
                  <p className={`${T.caption} tabular-nums ${TX.muted}`}>
                    {nextBest}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
