"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { FOCUS, T, TX } from "@/components/ui/tokens";
import { useId, useState } from "react";
import { getMatchBreakdown } from "./match-breakdown";

export function ScoringBreakdown({
  pickHome,
  pickAway,
  resultHome,
  resultAway,
  points,
  kickoffLabel,
}: {
  pickHome: number | null;
  pickAway: number | null;
  resultHome: number;
  resultAway: number;
  points: number;
  kickoffLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const breakdown = getMatchBreakdown(
    pickHome,
    pickAway,
    resultHome,
    resultAway,
  );

  return (
    // Content of the card's white body, not a band of its own: the ground
    // and the inset both come from CardShellBody. This used to paint its
    // own `bg-ink`, which is what made a settled card ink all the way down
    // (see DESIGN_SYSTEM.md -> Card anatomy, amended 2026-08-23).
    <div className="text-text">
      <button
        type="button"
        className={`flex min-h-11 w-full items-center gap-2 text-left ${T.dense} ${FOCUS}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={TX.base}>How did you score?</span>
        {/* Still a fill rather than `success` as text: this is one of the
            three emotional accent moments, and the fill reads the same on
            either ground. */}
        <span className="ml-auto rounded-badge bg-success px-2.5 py-1 font-extrabold text-on-ink">
          +{points} pts
        </span>
        <ChevronDown
          className={`size-4 ${TX.muted} transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={panelId}
          className="mt-1 flex flex-col gap-2 border-t border-paper-line pt-3"
        >
          {pickHome === null || pickAway === null ? (
            <p className={`${T.dense} ${TX.muted}`}>
              No pick was filed, so this match scored no points. Picks are never
              filled in automatically.
            </p>
          ) : breakdown.wrongWayRound ? (
            <div className={`flex items-center justify-between gap-3 ${T.dense}`}>
              <span className={TX.muted}>
                Wrong Way Round: you said {pickHome}–{pickAway}, it finished{" "}
                {resultHome}–{resultAway}.
              </span>
              <strong className={`shrink-0 ${TX.base}`}>
                +{breakdown.total}
              </strong>
            </div>
          ) : (
            breakdown.rows.map((row) => (
              <div
                key={row.label}
                className={`flex items-start justify-between gap-3 ${T.dense}`}
              >
                <span className={TX.muted}>
                  {row.label}
                  {row.detail ? (
                    <span className={`block ${T.caption} ${TX.decorative}`}>
                      {row.detail}
                    </span>
                  ) : null}
                </span>
                <strong className={`shrink-0 ${TX.base}`}>
                  {row.points === null ? "—" : `+${row.points}`}
                </strong>
              </div>
            ))
          )}
          {kickoffLabel ? (
            <p className={`${T.caption} ${TX.muted}`}>{kickoffLabel}</p>
          ) : null}
          <Link
            href={{ pathname: "/how-it-works", hash: "how-your-pick-scores" }}
            className={`inline-flex items-center gap-0.5 ${T.caption} font-bold ${TX.base} underline underline-offset-2 ${FOCUS}`}
          >
            How points work
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
