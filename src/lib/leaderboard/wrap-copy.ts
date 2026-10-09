import { ordinal } from "@/lib/format/ordinal";
import type { GameweekWrap, WrapAward } from "./wrap";

/**
 * The Gameweek wrap's words, in one place (#219 L2): the Season tab card
 * (#218) and the admin panel's "Copy as text" both read them, so the pasted
 * message can't drift from what players see in the app.
 */

export interface WrapPerson {
  displayName: string;
  emoji: string | null;
}

export type WrapPeople = Readonly<Record<string, WrapPerson>>;

type Kind = WrapAward["kind"];

/** Award marks are the "awards" emoji tier (docs/DESIGN_SYSTEM.md -> Icons):
 *  celebration, never chrome -- in the app each is aria-hidden behind its
 *  name. */
export const AWARD_META: Record<Kind, { mark: string; name: string }> = {
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

/** One fact per winner. Furthest Off points at the pick, never the person
 *  (#218 D6). */
export function winnerLines(award: WrapAward): WinnerLine[] {
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

/** A player's name, or a neutral stand-in if they've left the roster. */
export function nameOf(people: WrapPeople, playerId: string): string {
  return people[playerId]?.displayName ?? "A player";
}

/** "Mia", "Mia and Sam", "Mia, Sam and Jo". */
function joinNames(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Tipper of the Week's "next best" line, under a single winner. */
export function nextBestLine(
  award: WrapAward,
  people: WrapPeople,
): string | null {
  if (award.kind !== "tipper" || award.nextBest === null) return null;
  const names = award.nextBest.playerIds.map((id) => nameOf(people, id));
  return `${joinNames(names)} next best with ${award.nextBest.points}pts`;
}

/**
 * The admin panel's "Copy as text" (#219): every fired award, one line per
 * winner, as plain text that pastes cleanly into a messaging app -- no
 * markdown, `\n` endings, no trailing newline. The admin-only No picks line
 * is deliberately not part of it (#219 P2).
 */
export function formatWrapText(wrap: GameweekWrap, people: WrapPeople): string {
  const lines = [`Gameweek ${wrap.gameweekNumber} wrap`];
  for (const award of wrap.fired) {
    const { mark, name } = AWARD_META[award.kind];
    for (const line of winnerLines(award)) {
      lines.push(
        `${mark} ${name}: ${nameOf(people, line.playerId)} · ${line.fact}`,
      );
    }
    const nextBest = nextBestLine(award, people);
    if (nextBest !== null) lines.push(nextBest);
  }
  return lines.join("\n");
}
