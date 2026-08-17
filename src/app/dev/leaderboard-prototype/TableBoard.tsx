// PROTOTYPE -- Predict the Table segment. Throwaway.
//
// Same card, same tap-to-open panel, same rank column as the season board
// (VariantT) -- deliberately, because the whole argument for one route with
// two segments (ADR 0012 D1) is that they share a row grammar. What differs
// is only what the columns MEAN, and the two differences are structural:
//
//  - The rank column's "can't win" slot holds LATE, not BOT. There are no
//    Bots here (they predict scorelines, not tables), and a Late Joiner is
//    ineligible for THIS title where they're eligible for the season one.
//  - There is no movement, because no table stores a previous Table
//    Prediction Score to diff against.

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TABLE_MAX, type TableRow } from "./fixture";
import { Stat } from "./VariantT";

function Row({
  row,
  dayOne,
  open,
  onToggle,
}: {
  row: TableRow;
  dayOne: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const first = !dayOne && row.rank === 1;

  return (
    <li
      className={`relative overflow-hidden rounded-card shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)] ${
        first ? "bg-accent/20" : "bg-white"
      } ${row.lateJoiner ? "opacity-70" : ""}`}
    >
      {row.isYou ? (
        <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden />
      ) : null}
      <button
        type="button"
        disabled={dayOne}
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
      >
        {/* Same slot as the season board's rank column. No movement row
            underneath it -- nothing stores yesterday's score. */}
        <span className="flex w-7 shrink-0 items-center justify-center">
          {dayOne ? null : row.rank === null ? (
            <span className="text-[0.55rem] font-extrabold uppercase tracking-[0.06em] text-info">
              Late
            </span>
          ) : (
            <span className="text-lg font-extrabold tabular-nums text-ink/75">
              {row.rank}
            </span>
          )}
        </span>

        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full text-lg ${
            row.lateJoiner ? "bg-info/10" : "bg-paper"
          }`}
          aria-hidden
        >
          {row.emoji}
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate font-bold text-ink">{row.displayName}</span>
          {row.isYou ? (
            <span className="shrink-0 rounded-badge bg-accent px-1.5 py-0.5 text-[0.6rem] font-extrabold text-accent-ink">
              You
            </span>
          ) : null}
        </span>

        {!dayOne ? (
          <>
            <span className="flex shrink-0 items-baseline gap-1">
              <span className="text-xl font-extrabold leading-none tabular-nums text-ink">
                {row.score}
              </span>
              <span className="text-[0.7rem] leading-none tabular-nums text-ink/45">
                /{TABLE_MAX}
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
          <Stat value={String(row.placement)} label="Placement" />
          <Stat value={String(row.bandBonus)} label="Bands" />
          <Stat
            value={row.lateJoiner ? "–" : String(row.boldCall)}
            label="Bold calls"
          />
        </div>
      ) : null}
    </li>
  );
}

export function TableBoard({
  rows,
  dayOne,
}: {
  rows: TableRow[];
  dayOne: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const hasLateJoiner = rows.some((row) => row.lateJoiner);

  return (
    <>
      {dayOne ? (
        <p className="text-sm text-ink/70">
          Tables are in — scores start once the season does.
        </p>
      ) : (
        <p className="text-sm text-ink/70">
          Scored against the real table as it stands today, out of {TABLE_MAX}.
          It doesn&apos;t count towards your season points.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <Row
            key={row.playerId}
            row={row}
            dayOne={dayOne}
            open={openId === row.playerId}
            onToggle={() =>
              setOpenId(openId === row.playerId ? null : row.playerId)
            }
          />
        ))}
      </ul>

      {!dayOne && hasLateJoiner ? (
        <p className="text-xs text-ink/50">
          Players who joined after the season started can still fill in a table,
          but can&apos;t win this one — they saw some results first.
        </p>
      ) : null}
    </>
  );
}
