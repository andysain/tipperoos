"use client";

// PROTOTYPE copy of src/components/leaderboard/LeaderboardRowCard.tsx with
// one intended addition -- a "See X's picks" affordance in the tap-to-open
// panel (ADR 0013 D7/D9). Rewritten after review.
//
// NOTE FOR THE REAL COMPONENT: most of what was fixed here is wrong in
// production too, not just in this copy --
//   * `open` lived in per-row state, so N panels could be open at once,
//     against ADR 0012 D11's "one card is open at a time, so the list never
//     doubles in height". State is lifted to the list here.
//   * seven type sizes with a 0.55rem (~8.8px) floor
//   * six ink alphas, five of which fail AA on white (ink/70 at 4.85:1 is
//     the real floor for text that carries meaning)
//   * no focus-visible treatment anywhere
//   * D4's "20-character name without truncation" doesn't hold at 390px;
//     dropping the chevron buys back the width, and the panel's own
//     presence plus aria-expanded already carry open/closed.

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ProtoBoardRow } from "./season";
import {
  FOCUS,
  LABEL,
  INSET,
  T_CAPTION,
  T_DENSE,
  TEXT,
  TEXT_MUTED,
} from "./shared";

function RankSlot({ row }: { row: ProtoBoardRow }) {
  if (row.rank === null) {
    return (
      <span className="flex w-7 shrink-0 items-center justify-center">
        {/* A peer of the rank numeral, not a footnote. D12's whole argument
            is that this column ANSWERS "where does this player stand"; at
            8.8px it whispered it. */}
        {/* info at 0.875/800 clears AA-large; at 0.75rem it did not. */}
        <span className="text-[0.875rem] font-extrabold uppercase tracking-[0.06em] text-info">
          Bot
        </span>
      </span>
    );
  }
  return (
    <span className="flex w-7 shrink-0 flex-col items-center leading-none">
      <span className="text-xl font-extrabold tabular-nums text-ink">
        {row.rank}
      </span>
      {row.movement === null ? (
        // "1st week", not "NEW": NEW was the same mark as BOT (short, teal,
        // uppercase) in an overlapping slot, for a structurally opposite
        // fact, and it reads as "new to the top of the table". A temporary
        // absence of data is not a category, so it isn't `info`.
        <span className={`mt-0.5 text-[0.7rem] font-bold ${TEXT_MUTED}`}>
          1st wk
        </span>
      ) : row.movement === 0 ? (
        <span
          className="mt-0.5 text-[0.75rem] font-bold text-ink/35"
          aria-label="No change since last week"
        >
          –
        </span>
      ) : (
        <span
          className={`mt-0.5 text-[0.75rem] font-bold tabular-nums ${
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
    <span className="flex flex-1 flex-col items-center rounded-btn-sm bg-paper px-2 py-1.5">
      <span className={`${T_DENSE} font-extrabold tabular-nums ${TEXT}`}>
        {value}
      </span>
      <span className={`${LABEL} ${TEXT_MUTED}`}>{label}</span>
    </span>
  );
}

function Row({
  row,
  open,
  onToggle,
  onOpenRecord,
}: {
  row: ProtoBoardRow;
  open: boolean;
  onToggle: () => void;
  onOpenRecord: (playerId: string) => void;
}) {
  const first = row.rank === 1;
  const panelId = `panel-${row.playerId}`;

  return (
    <li
      className={`relative overflow-hidden rounded-card shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)] ${
        first ? "bg-accent/20" : "bg-white"
      }`}
    >
      {row.isViewer ? (
        <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden />
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={`flex w-full items-center gap-2 ${INSET} py-2 text-left ${FOCUS}`}
      >
        <RankSlot row={row} />
        <span
          // A mute, not a hue: DESIGN_SYSTEM.md -> Icons says the chip's fill
          // is never state, and info on the chip puts the palette on top of
          // an identity the player chose. info stays on the BOT label.
          className={`grid size-9 shrink-0 place-items-center rounded-full text-lg ${
            row.isBot ? "bg-ink/8" : "bg-paper"
          }`}
          aria-hidden
        >
          {row.emoji}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={`truncate ${T_DENSE} font-bold ${TEXT}`}>
            {row.displayName}
          </span>
          {row.isViewer ? (
            // Ink, not accent, when it lands on the 1st-place tint: a solid
            // accent pill on an accent/20 ground has almost no edge, and
            // three accent intensities on one card is three objects with no
            // hierarchy. Ink-as-surface is sanctioned grammar and is one
            // FEWER accent object, not a fourth.
            <span
              className={`shrink-0 rounded-badge px-1.5 py-0.5 ${LABEL} ${
                first ? "bg-ink text-paper" : "bg-accent text-accent-ink"
              }`}
            >
              You
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span
            className={`text-xl leading-none tabular-nums ${
              row.isBot ? "font-bold text-ink/70" : "font-extrabold text-ink"
            }`}
          >
            {row.points}
          </span>
          {row.pointsPerGameweek !== null ? (
            <span
              className={`text-[0.75rem] leading-none tabular-nums ${TEXT_MUTED}`}
            >
              {row.pointsPerGameweek.toFixed(1)}/wk
            </span>
          ) : null}
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          className={`flex flex-col gap-2 border-t border-paper-line ${INSET} py-2.5`}
        >
          <div className="flex gap-1.5">
            {/* "Exact score", not "Spot on" -- the app had four names for
                one concept. "Right result" already matches
                MATCH_SCORING_TERMS[0], so the others conform to the engine's
                vocabulary rather than inventing panel-local words. */}
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
          {/* A fourth quiet object in the panel, not the loudest thing on a
              page whose subject is the ranking. */}
          <button
            type="button"
            onClick={() => onOpenRecord(row.playerId)}
            className={`flex min-h-11 items-center justify-between rounded-btn bg-paper px-3 ${T_CAPTION} font-bold ${TEXT} ${FOCUS}`}
          >
            See {row.isViewer ? "your" : `${row.displayName}'s`} picks
            <ChevronRight className="size-4 stroke-ink/70" aria-hidden />
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function LeaderboardList({
  rows,
  onOpenRecord,
}: {
  rows: ProtoBoardRow[];
  onOpenRecord: (playerId: string) => void;
}) {
  // Lifted out of the row: ADR 0012 D11 says one card is open at a time so
  // the list never doubles in height. Per-row state let every card open.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {/* The only thing that actually teaches D12's rule. A 30% dim and an
          8.8px label can hint that a bot is outside the competition; a
          sentence can say it. */}
      <p className={`px-1 ${T_CAPTION} ${TEXT_MUTED}`}>
        Bots play too, but only a real player can win the season. Beat the
        Median Bot and you beat the whole group&apos;s average.
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <Row
            key={row.playerId}
            row={row}
            open={openId === row.playerId}
            onToggle={() =>
              setOpenId((current) =>
                current === row.playerId ? null : row.playerId,
              )
            }
            onOpenRecord={onOpenRecord}
          />
        ))}
      </ul>
    </div>
  );
}
