// PROTOTYPE VARIANT S -- "Ink spine". Throwaway. Out-there option 2.
//
// Bet: the leaderboard should look like it belongs to THIS app rather than
// to any leaderboard, and the app already has a distinctive move it isn't
// using here -- dark ink as a *surface*, not just as text colour
// (docs/DESIGN_SYSTEM.md -> Card anatomy, the CardShell grammar the Tipped
// Match card is built from). So the rank column becomes an ink spine down
// the left edge of every card, carrying rank and movement in reverse-out
// type, with the accent spine reserved for 1st.
//
// What it's really testing: whether a leaderboard reads better as a stack
// of *cards with identity* than as a list of rows -- and whether 16 ink
// spines in a column is handsome or heavy. The honest risk is that ink at
// this frequency stops being an accent and becomes the page.

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { INELIGIBLE_LABEL, movement, perWeek, type ProtoRow } from "./fixture";

function SpineDelta({
  delta,
  onGold,
}: {
  delta: number | null;
  onGold: boolean;
}) {
  const base = onGold ? "text-accent-ink/70" : "text-white/60";
  if (delta === null)
    return (
      <span className={`text-[0.55rem] font-bold uppercase ${base}`}>new</span>
    );
  if (delta === 0)
    return <span className={`text-[0.6rem] font-bold ${base}`}>–</span>;
  // success/danger don't clear the contrast floor on ink, so movement on the
  // spine is carried by the glyph alone rather than by colour -- the palette
  // rule (rank movement reuses success/danger) can't apply on this ground.
  return (
    <span
      className={`text-[0.6rem] font-bold tabular-nums ${base}`}
      aria-label={`${delta > 0 ? "Up" : "Down"} ${Math.abs(delta)} places`}
    >
      {delta > 0 ? "▲" : "▼"}
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

export function VariantS({
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
                muted ? "opacity-70" : ""
              }`}
            >
              <button
                type="button"
                disabled={dayOne}
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : row.playerId)}
                className="flex w-full items-stretch text-left"
              >
                {!dayOne ? (
                  <span
                    className={`flex w-11 shrink-0 flex-col items-center justify-center gap-0.5 ${
                      first ? "bg-accent" : "bg-ink"
                    }`}
                  >
                    <span
                      className={`text-lg font-extrabold leading-none tabular-nums ${
                        first ? "text-accent-ink" : "text-white"
                      }`}
                    >
                      {row.rank}
                    </span>
                    <SpineDelta delta={movement(row)} onGold={first} />
                  </span>
                ) : null}

                <span className="flex flex-1 items-center gap-2.5 bg-white px-3 py-2">
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
                </span>
              </button>

              {open && !dayOne ? (
                <div className="flex gap-1.5 border-t border-paper-line bg-white px-3 py-2.5">
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
