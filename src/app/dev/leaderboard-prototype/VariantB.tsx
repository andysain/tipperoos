// PROTOTYPE VARIANT B -- "Matchday program". Throwaway.
//
// Bet: this is a kid-friendly app whose design system is built on lifted
// cards, and a leaderboard of 16 people is a roster, not a spreadsheet.
// Every player is their own card with breathing room; the rank is a display
// numeral, not a table cell; the emoji gets a coloured circle chip
// (mini-avatar -- the OTHER side of docs/DESIGN_SYSTEM.md -> Icons' open
// question, deliberately opposed to Variant A so the two can be compared).
// No shared layout with A or C by design.

import { INELIGIBLE_LABEL, movement, perWeek, type ProtoRow } from "./fixture";

function MovementPill({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="rounded-badge bg-info/10 px-2 py-0.5 text-[0.65rem] font-bold text-info">
        New
      </span>
    );
  }
  if (delta === 0) {
    return (
      <span className="rounded-badge bg-ink/5 px-2 py-0.5 text-[0.65rem] font-bold text-ink/40">
        Held
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`rounded-badge px-2 py-0.5 text-[0.65rem] font-bold tabular-nums ${
        up ? "bg-success/12 text-success" : "bg-danger/12 text-danger"
      }`}
    >
      {up ? `▲ ${delta}` : `▼ ${Math.abs(delta)}`}
    </span>
  );
}

export function VariantB({
  rows,
  dayOne,
}: {
  rows: ProtoRow[];
  dayOne: boolean;
}) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-[1.9rem] font-extrabold text-ink">Leaderboard</h1>

      {dayOne ? (
        <p className="text-sm text-ink/70">
          No points yet — the season starts here. Everyone below is in.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const first = !dayOne && row.rank === 1;
          const muted = row.ineligible !== null;
          return (
            <li
              key={row.playerId}
              className={`flex items-center gap-3 overflow-hidden rounded-card p-3 shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)] ${
                first ? "bg-accent/20" : "bg-white"
              } ${muted ? "opacity-70" : ""}`}
            >
              {!dayOne ? (
                <span className="w-9 shrink-0 text-center text-2xl font-extrabold tabular-nums text-ink/80">
                  {row.rank}
                </span>
              ) : null}

              <span
                className={`grid size-11 shrink-0 place-items-center rounded-full text-xl ${
                  muted ? "bg-info/10" : "bg-paper"
                }`}
                aria-hidden
              >
                {row.emoji}
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[1.0625rem] font-bold text-ink">
                    {row.displayName}
                  </span>
                  {row.isYou ? (
                    <span className="shrink-0 rounded-badge bg-accent px-1.5 py-0.5 text-[0.6rem] font-extrabold text-accent-ink">
                      You
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {!dayOne ? <MovementPill delta={movement(row)} /> : null}
                  {row.ineligible ? (
                    <span className="rounded-badge bg-info/10 px-2 py-0.5 text-[0.65rem] font-bold text-info">
                      {INELIGIBLE_LABEL[row.ineligible]} · can&apos;t win
                    </span>
                  ) : null}
                </span>
              </span>

              {!dayOne ? (
                <span className="flex shrink-0 flex-col items-end">
                  <span className="text-2xl font-extrabold tabular-nums text-ink">
                    {row.points}
                  </span>
                  <span className="text-[0.7rem] tabular-nums text-ink/50">
                    {perWeek(row)} / week
                  </span>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
