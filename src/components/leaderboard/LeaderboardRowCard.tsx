"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LeaderboardRow } from "@/lib/leaderboard/board";

// The leaderboard's row (docs/adr/0012-leaderboard-view.md D11): a
// matchday-program card rather than a table row, chosen against a dense
// table and a proportional-bar ladder. Closed height is one line per
// column -- D11 makes density a requirement, not polish, because a board
// whose job is comparing players fails if it only shows six of them.

function RankSlot({ row }: { row: LeaderboardRow }) {
  // A Bot has no rank (D12). The reserved column carries BOT instead of
  // sitting empty, which also means the name line needs no "Bot" chip.
  if (row.rank === null) {
    return (
      <span className="flex w-7 shrink-0 items-center justify-center">
        <span className="text-[0.55rem] font-extrabold uppercase tracking-[0.06em] text-info">
          Bot
        </span>
      </span>
    );
  }

  return (
    <span className="flex w-7 shrink-0 flex-col items-center leading-none">
      <span className="text-lg font-extrabold tabular-nums text-ink/75">
        {row.rank}
      </span>
      {row.movement === null ? (
        <span className="mt-0.5 text-[0.55rem] font-bold uppercase text-info">
          new
        </span>
      ) : row.movement === 0 ? (
        <span
          className="mt-0.5 text-[0.6rem] font-bold text-ink/25"
          aria-hidden
        >
          –
        </span>
      ) : (
        <span
          className={`mt-0.5 text-[0.6rem] font-bold tabular-nums ${
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
    <span className="flex flex-1 flex-col items-center rounded-btn bg-paper px-2 py-1.5">
      <span className="text-base font-extrabold tabular-nums text-ink">
        {value}
      </span>
      <span className="text-[0.6rem] font-bold uppercase tracking-[0.06em] text-ink/50">
        {label}
      </span>
    </span>
  );
}

export function LeaderboardRowCard({
  row,
  scored,
}: {
  row: LeaderboardRow;
  scored: boolean;
}) {
  const [open, setOpen] = useState(false);
  const first = scored && row.rank === 1;

  return (
    <li
      className={`relative overflow-hidden rounded-card shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)] ${
        first ? "bg-accent/20" : "bg-white"
      } ${row.isBot ? "opacity-70" : ""}`}
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
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
      >
        {scored ? <RankSlot row={row} /> : <span className="w-1 shrink-0" />}

        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full text-lg ${
            row.isBot ? "bg-info/10" : "bg-paper"
          }`}
          aria-hidden
        >
          {row.emoji ?? "⚽"}
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate font-bold text-ink">{row.displayName}</span>
          {row.isViewer ? (
            <span className="shrink-0 rounded-badge bg-accent px-1.5 py-0.5 text-[0.6rem] font-extrabold text-accent-ink">
              You
            </span>
          ) : null}
        </span>

        {scored ? (
          <>
            <span className="flex shrink-0 items-baseline gap-1.5">
              <span className="text-xl font-extrabold leading-none tabular-nums text-ink">
                {row.points}
              </span>
              {row.pointsPerGameweek !== null ? (
                <span className="text-[0.7rem] leading-none tabular-nums text-ink/45">
                  {row.pointsPerGameweek.toFixed(1)}/wk
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={`size-4 shrink-0 stroke-ink/35 transition-transform ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </>
        ) : null}
      </button>

      {open && scored ? (
        <div className="flex gap-1.5 border-t border-paper-line px-3 py-2.5">
          <Stat value={String(row.exactTips)} label="Spot on" />
          <Stat
            value={`${row.correctResults}/${row.matchesScored}`}
            label="Right result"
          />
          <Stat
            value={row.pointsPerGameweek?.toFixed(1) ?? "–"}
            label="Per week"
          />
        </div>
      ) : null}
    </li>
  );
}
