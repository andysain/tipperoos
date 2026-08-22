"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { LeaderboardRow } from "@/lib/leaderboard/board";
import { EmojiChip } from "@/components/ui/PlayerChip";
import { T, TX, MICRO_LABEL, FOCUS, INSET } from "@/components/ui/tokens";

// The leaderboard's row (docs/adr/0012-leaderboard-view.md D11): a
// matchday-program card rather than a table row, chosen against a dense
// table and a proportional-bar ladder. Closed height is one line per
// column -- D11 makes density a requirement, not polish, because a board
// whose job is comparing players fails if it only shows six of them.

function RankSlot({
  row,
  anyMovement,
}: {
  row: LeaderboardRow;
  /** Does ANY row have movement? In the first scored gameweek nobody does,
   *  because there is no previous snapshot to compare against — so "1st wk"
   *  is true of the whole board and marks nothing. It only means something
   *  once it distinguishes one player from the rest. */
  anyMovement: boolean;
}) {
  // A Bot has no rank (D12). The reserved column carries BOT instead of
  // sitting empty, which also means the name line needs no "Bot" chip.
  if (row.rank === null) {
    return (
      <span className="flex w-7 shrink-0 items-center justify-center">
        {/* A peer of the rank numeral, not a footnote. D12's whole argument
            is that this column ANSWERS "where does this player stand"; at
            0.55rem under a blanket opacity it whispered it, at ~2.6:1. */}
        <span className="text-[0.9rem] font-extrabold uppercase tracking-[0.06em] text-info">
          Bot
        </span>
      </span>
    );
  }

  return (
    <span className="flex w-7 shrink-0 flex-col items-center leading-none">
      <span className="text-xl font-extrabold tabular-nums text-text">
        {row.rank}
      </span>
      {row.movement === null ? (
        !anyMovement ? null : (
          // "1st wk", not "NEW": NEW was the same mark as BOT (short, teal,
          // uppercase) 20px away, for a structurally opposite fact -- BOT
          // replaces the numeral, this sits under one -- and it reads as "new
          // to the top of the table". A temporary absence of data is not a
          // category, so it isn't `info`.
          <span className={`mt-0.5 ${T.label} font-bold ${TX.muted}`}>New</span>
        )
      ) : row.movement === 0 ? (
        <span
          className={`mt-0.5 ${T.label} font-bold ${TX.decorative}`}
          aria-label="No change since last week"
        >
          –
        </span>
      ) : (
        <span
          // Size, not palette: success is 3.14:1 and danger 3.93:1 on paper,
          // so both need AA-large to clear. The glyph carries the signal
          // redundantly anyway.
          className={`mt-0.5 ${T.label} font-bold tabular-nums ${
            row.movement > 0 ? "text-success" : "text-danger"
          }`}
          aria-label={`${row.movement > 0 ? "Up" : "Down"} ${Math.abs(
            row.movement,
          )} ${Math.abs(row.movement) === 1 ? "place" : "places"} since last week`}
        >
          {row.movement > 0 ? "▲" : "▼"}
          {Math.abs(row.movement)}
        </span>
      )}
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    // rounded-btn-sm, not rounded-btn: these aren't interactive, and sharing
    // a radius and ground with the panel's button was an affordance lie.
    <span className="flex flex-1 flex-col items-center rounded-btn-sm bg-paper px-2 py-1.5">
      <span className={`${T.dense} font-extrabold tabular-nums text-text`}>
        {value}
      </span>
      <span className={`${MICRO_LABEL} ${TX.muted}`}>{label}</span>
    </span>
  );
}

export function LeaderboardRowCard({
  row,
  scored,
  anyMovement,
  open,
  onToggle,
}: {
  row: LeaderboardRow;
  scored: boolean;
  anyMovement: boolean;
  /** Owned by the list, not the row. Per-row state let every panel open at
   *  once, against docs/adr/0012-leaderboard-view.md D11 -- "one card is open
   *  at a time, so the list never doubles in height" -- which is the
   *  guarantee D11 picked the tap-to-open panel on in the first place. */
  open: boolean;
  onToggle: () => void;
}) {
  const first = scored && row.rank === 1;
  const panelId = `leaderboard-panel-${row.playerId}`;

  return (
    <li
      className={`relative overflow-hidden rounded-card shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)] ${
        first ? "bg-accent/20" : "bg-white"
      }`}
    >
      {/* Own-row findability lives on the card edge, never on the emoji --
          the emoji is the player's own choice and recolouring it makes it
          read as a system state (D7, and docs/DESIGN_SYSTEM.md -> Icons). */}
      {row.isViewer ? (
        <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden />
      ) : null}

      <button
        type="button"
        disabled={!scored}
        aria-expanded={scored ? open : undefined}
        aria-controls={scored ? panelId : undefined}
        onClick={onToggle}
        className={`flex w-full items-center gap-1.5 ${INSET} py-2 text-left ${FOCUS}`}
      >
        {scored ? (
          <RankSlot row={row} anyMovement={anyMovement} />
        ) : (
          <span className="w-1 shrink-0" />
        )}

        {/* The chip's fill is never state (DESIGN_SYSTEM.md -> Icons), so a
            bot is MUTED rather than tinted -- info belongs on the BOT label,
            not on top of an identity the player chose. */}
        <EmojiChip emoji={row.emoji} muted={row.isBot} />

        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={`truncate ${T.dense} font-bold text-text`}>
            {row.displayName}
          </span>
          {row.isViewer ? (
            // Ink when it lands on the 1st-place tint: a solid accent pill on
            // an accent/20 ground has almost no edge, and three accent
            // intensities on one card is three objects with no hierarchy
            // between them. Ink-as-surface is sanctioned grammar, and this is
            // one FEWER accent object, not a fourth.
            <span
              className={`shrink-0 rounded-badge px-1.5 py-0.5 ${MICRO_LABEL} ${
                first ? "bg-ink text-on-ink" : "bg-accent text-accent-ink"
              }`}
            >
              You
            </span>
          ) : null}
        </span>

        {scored ? (
          <>
            <span className="flex shrink-0 items-baseline gap-1.5">
              <span
                className={`text-xl leading-none tabular-nums ${
                  row.isBot
                    ? `font-bold ${TX.muted}`
                    : "font-extrabold text-text"
                }`}
              >
                {row.points}
              </span>
              {row.pointsPerGameweek !== null ? (
                <span
                  className={`${T.label} leading-none tabular-nums ${TX.muted}`}
                >
                  {row.pointsPerGameweek.toFixed(1)}/wk
                </span>
              ) : null}
            </span>
            {/* The chevron is back. It was dropped to buy width for ADR
                0012 D4's "20-character name without truncation" -- but
                measured, a 20-character name fits on a 393px viewport with
                0px to spare and is ALREADY clipped at 375px, chevron or no
                chevron. So withholding it bought nothing the rule promised,
                and cost the only visual hint that a row opens: `aria-expanded`
                and the panel's own presence tell you AFTER you've discovered
                the gesture, not before. Small, muted, and it rotates.
                D4's width promise is unmet at 375px either way — that is a
                rule to revisit, not a reason to hide the affordance. */}
            <ChevronDown
              className={`size-3.5 shrink-0 stroke-text-muted transition-transform ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </>
        ) : null}
      </button>

      {open && scored ? (
        // "Exact score", not "Spot on": the app had four names for one
        // concept. "Right result" already matches MATCH_SCORING_TERMS[0], so
        // the others conform to the engine's vocabulary rather than inventing
        // panel-local words. Both counts carry their denominator -- a bare
        // count reads as a second ranking, and a Late Joiner's 5 means
        // something different from an on-time player's 5 (D10).
        <div
          id={panelId}
          className={`flex flex-col gap-2 border-t border-paper-line ${INSET} py-2.5`}
        >
          <div className="flex gap-1.5">
            <Stat
              value={`${row.exactTips} of ${row.matchesScored}`}
              label="Exact score"
            />
            <Stat
              value={`${row.correctResults} of ${row.matchesScored}`}
              label="Right result"
            />
            <Stat value={String(row.gameweeksPlayed)} label="Weeks" />
          </div>
          {/* The player axis's entry point (ADR 0013 D7): a fourth quiet
              object in the panel, not the loudest thing on a page whose
              subject is the ranking. */}
          <Link
            href={`/picks/${row.playerId}`}
            className={`flex min-h-11 items-center justify-between rounded-btn bg-paper px-3 ${T.caption} font-bold text-text ${FOCUS}`}
          >
            See {row.isViewer ? "your" : `${row.displayName}'s`} picks
            <ChevronRight className="size-4 stroke-text-muted" aria-hidden />
          </Link>
        </div>
      ) : null}
    </li>
  );
}
