"use client";

// SETTLED -- the "eyebrow" header: meta above the teams, so the card ends on
// the scoreline instead of trailing off into small print.
//
// Fixed in review:
//   * NO ACCENT. It was spent twice here -- on the provenance label and on
//     the `Locked` chip -- against a budget DESIGN_SYSTEM.md:21 caps at
//     three spots, none of which is metadata or a lifecycle status. The one
//     legitimate accent on this card is a player's OWN predicted scoreline,
//     which is sanctioned spot #2 and is what the other two were stealing
//     from.
//   * The date is read from the match, not hardcoded. Every card on every
//     gameweek previously said 14 February while the strip travelled nine
//     months of a season.
//   * Voided and revealed-not-started have real chips.

import { Flame, Shuffle } from "lucide-react";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import { CardShell, CardShellSeam } from "@/components/ui/CardShell";
import { matchBadgeColors } from "@/lib/teams/kit-colors";
import type { ProtoMatch } from "./fixture";
import {
  Points,
  TEXT,
  TEXT_MUTED,
  LABEL,
  INSET,
  T_BODY,
  T_CAPTION,
  T_LABEL,
  T_SCORE,
  ON_INK,
  ON_INK_MUTED,
  ordinal,
} from "./shared";

// NOTE: the `home` micro-label was removed at Andy's call -- it cost width
// the score needs, and the shipped TippedMatchCard had already dropped it
// for the same reason. This puts BOTH cards in tension with
// DESIGN_SYSTEM.md -> Team display ("Home and away are stated, not
// implied"), so the doc is now the thing that's out of date, not the code.
// Logged in docs/production-ui-findings.md.

export type CardState = "open" | "locked" | "final" | "voided";

// "Open" said nothing a visible row of tappable digits doesn't already say,
// so the chip carries the highest-value fact on the card instead: when this
// match's picks close. `open` and `locked` also used to share a fill, so the
// chip stopped carrying information at exactly the moment it mattered.
// "Called off", not "Void" -- one word for one thing, and it's a neutral
// non-event for everyone equally, so it isn't `danger`.
const CHIP: Record<CardState, { label: string; cls: string }> = {
  open: { label: "", cls: "bg-paper/15 text-paper" },
  locked: { label: "Locked", cls: "bg-paper/25 text-paper font-extrabold" },
  final: { label: "Final", cls: "bg-paper text-ink" },
  voided: { label: "Called off", cls: "bg-warning text-ink" },
};

function Team({
  name,
  code,
  position,
  fill,
  score,
  tone,
}: {
  name: string;
  code: string;
  position: number;
  fill: string;
  score: number | null;
  tone: "own-pick" | "result";
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={`w-6 shrink-0 ${T_LABEL} font-bold tabular-nums ${ON_INK_MUTED}`}
      >
        {ordinal(position)}
      </span>
      <ClubCodeBadge shortCode={code} fill={fill} />
      <span className={`min-w-0 flex-1 truncate ${T_BODY} font-bold ${ON_INK}`}>
        {name}
      </span>
      {score !== null ? (
        <span
          className={`shrink-0 ${T_SCORE} font-extrabold leading-none tabular-nums ${
            tone === "result" ? ON_INK : "text-accent"
          }`}
        >
          {score}
        </span>
      ) : null}
    </div>
  );
}

export function ProtoMatchCard({
  match,
  state,
  scores,
  ownPick,
  ownPoints,
  closesLabel,
  children,
}: {
  match: ProtoMatch;
  state: CardState;
  scores?: { home: number; away: number };
  /** In a half-played gameweek the finished card shows the RESULT in the
   *  header, so the player's own pick needs somewhere else to live -- it is
   *  still the thing they came back to check. */
  ownPick?: { home: number; away: number };
  ownPoints?: number | null;
  /** When THIS match's picks close. Each match has its own kickoff, so a
   *  single section-level deadline is only ever the earlier of the two --
   *  and missing a lock is the one irreversible failure in the product. */
  closesLabel?: string;
  children?: React.ReactNode;
}) {
  const badges = matchBadgeColors(match.home.shortCode, match.away.shortCode);
  const tone = state === "final" ? "result" : "own-pick";
  const chip = CHIP[state];
  // Shuffle, not Dices: a pair of dice is the most gambling-coded glyph in
  // any icon set, on an app whose spec bans gambling language. Flame, not
  // Star: docs/in-app-help-spec.md says not to hint at the deferred Star
  // Match feature, and a star does exactly that.
  const Icon = match.provenance === "Top Matchup" ? Flame : Shuffle;

  return (
    <CardShell className="bg-white">
      <div className={`flex flex-col gap-2 bg-ink ${INSET} py-3`}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={`flex items-center gap-1.5 ${T_CAPTION} ${ON_INK_MUTED}`}
          >
            <span className="inline-flex items-center gap-1 font-bold">
              <Icon className="size-[0.9em]" aria-hidden />
              {match.provenance}
            </span>
            <span aria-hidden>·</span>
            <span>{match.kickoffLabel}</span>
          </span>
          {state === "open" && closesLabel ? (
            <span
              className={`shrink-0 rounded-badge bg-paper/15 px-2 py-0.5 ${LABEL} ${ON_INK}`}
            >
              Closes {closesLabel}
            </span>
          ) : chip.label ? (
            <span
              className={`shrink-0 rounded-badge px-2 py-0.5 ${LABEL} ${chip.cls}`}
            >
              {chip.label}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <Team
            name={match.home.name}
            code={match.home.shortCode}
            position={match.home.position}
            fill={badges.home}
            score={scores?.home ?? null}
            tone={tone}
          />
          <Team
            name={match.away.name}
            code={match.away.shortCode}
            position={match.away.position}
            fill={badges.away}
            score={scores?.away ?? null}
            tone={tone}
          />
        </div>
      </div>
      <CardShellSeam
        segments={[{ fill: badges.home }, { fill: badges.away }]}
      />
      {ownPick ? (
        <div
          className={`flex items-baseline gap-2 bg-white ${INSET} py-2 ${T_CAPTION}`}
        >
          <span className={`flex-1 ${TEXT_MUTED}`}>
            You picked{" "}
            <span className={`font-bold tabular-nums ${TEXT}`}>
              {ownPick.home}–{ownPick.away}
            </span>
          </span>
          <Points points={ownPoints ?? null} />
        </div>
      ) : null}
      {children}
    </CardShell>
  );
}
