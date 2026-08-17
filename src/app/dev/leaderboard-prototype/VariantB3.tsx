// PROTOTYPE VARIANT B3 -- "Matchday program, tap to open". Throwaway.
//
// CHOSEN placement (2026-08-16). The counts live behind a tap: the closed
// card stays as scannable as a table row, and the panel is an extension
// point for further stats without the closed list paying for them.
//
// Compressed 2026-08-16: the first pass stacked name-then-badges on the
// left and points-then-per-week on the right, so every card was two rows
// tall in both columns and ~120px high for five short values. Now the left
// column is a single line (name, You, movement, tags all inline) and the
// right column pairs the total with a tighter per-week caption -- roughly
// half the height, same information, and ~11 cards visible on a phone
// instead of 6.

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { INELIGIBLE_LABEL, movement, perWeek, type ProtoRow } from "./fixture";

function Movement({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="shrink-0 text-[0.65rem] font-bold text-info">new</span>
    );
  }
  if (delta === 0) {
    return (
      <span
        className="shrink-0 text-[0.7rem] font-bold text-ink/25"
        aria-label="No change"
      >
        –
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`shrink-0 text-[0.7rem] font-bold tabular-nums ${
        up ? "text-success" : "text-danger"
      }`}
      aria-label={`${up ? "Up" : "Down"} ${Math.abs(delta)} places`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
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

export function VariantB3({
  rows,
  dayOne,
}: {
  rows: ProtoRow[];
  dayOne: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-[1.9rem] font-extrabold text-ink">Leaderboard</h1>

      {dayOne ? (
        <p className="text-sm text-ink/70">
          No points yet — the season starts here. Everyone below is in.
        </p>
      ) : null}

      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const first = !dayOne && row.rank === 1;
          const muted = row.ineligible !== null;
          const open = openId === row.playerId;
          return (
            <li
              key={row.playerId}
              className={`overflow-hidden rounded-card shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)] ${
                first ? "bg-accent/20" : "bg-white"
              } ${muted ? "opacity-70" : ""}`}
            >
              <button
                type="button"
                disabled={dayOne}
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : row.playerId)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
              >
                {!dayOne ? (
                  <span className="w-6 shrink-0 text-center text-lg font-extrabold tabular-nums text-ink/70">
                    {row.rank}
                  </span>
                ) : null}

                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full text-lg ${
                    muted ? "bg-info/10" : "bg-paper"
                  }`}
                  aria-hidden
                >
                  {row.emoji}
                </span>

                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate font-bold text-ink">
                    {row.displayName}
                  </span>
                  {row.isYou ? (
                    <span className="shrink-0 rounded-badge bg-accent px-1.5 py-0.5 text-[0.6rem] font-extrabold text-accent-ink">
                      You
                    </span>
                  ) : null}
                  {row.ineligible ? (
                    <span className="shrink-0 rounded-badge bg-info/10 px-1.5 py-0.5 text-[0.6rem] font-bold text-info">
                      {INELIGIBLE_LABEL[row.ineligible]}
                    </span>
                  ) : null}
                  {!dayOne ? <Movement delta={movement(row)} /> : null}
                </span>

                {!dayOne ? (
                  <>
                    <span className="flex shrink-0 items-baseline gap-1.5">
                      <span className="text-xl font-extrabold leading-none tabular-nums text-ink">
                        {row.points}
                      </span>
                      <span className="text-[0.7rem] leading-none tabular-nums text-ink/45">
                        {perWeek(row)}/wk
                      </span>
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

              {open && !dayOne ? (
                <div className="flex gap-1.5 border-t border-paper-line px-3 py-2.5">
                  <Stat value={String(row.exactTips)} label="Spot on" />
                  <Stat
                    value={`${row.correctResults}/${row.matchesScored}`}
                    label="Right result"
                  />
                  <Stat value={perWeek(row) ?? "–"} label="Per week" />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
