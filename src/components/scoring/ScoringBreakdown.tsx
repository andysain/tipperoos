"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
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
    <div className="bg-ink px-3.5 pb-3.5 text-paper">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 text-left text-[0.86rem]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-paper/75">How did you score?</span>
        {/* A fill, because this panel sits on an INK ground -- the one
            direction `success` still can't carry as text. The two term
            values below are on the same ground for the same reason. */}
        <span className="ml-auto rounded-badge bg-success px-2.5 py-1 font-extrabold text-on-ink">
          +{points} pts
        </span>
        <ChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={panelId}
          className="flex flex-col gap-2 border-t border-paper/15 pt-3"
        >
          {pickHome === null || pickAway === null ? (
            <p className="text-sm text-paper/75">
              No pick was filed, so this match scored no points. Picks are never
              filled in automatically.
            </p>
          ) : breakdown.wrongWayRound ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>
                Wrong Way Round: you said {pickHome}–{pickAway}, it finished{" "}
                {resultHome}–{resultAway}.
              </span>
              <strong className="shrink-0 text-on-ink">
                +{breakdown.total}
              </strong>
            </div>
          ) : (
            breakdown.rows.map((row) => (
              <div
                key={row.label}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span className="text-paper/80">
                  {row.label}
                  {row.detail ? (
                    <span className="block text-xs text-paper/50">
                      {row.detail}
                    </span>
                  ) : null}
                </span>
                <strong className="shrink-0 text-on-ink">
                  {row.points === null ? "—" : `+${row.points}`}
                </strong>
              </div>
            ))
          )}
          {kickoffLabel ? (
            <p className="text-xs text-paper/55">{kickoffLabel}</p>
          ) : null}
          <Link
            href={{ pathname: "/how-it-works", hash: "how-your-pick-scores" }}
            className="text-[0.8rem] font-bold text-on-ink underline underline-offset-2"
          >
            How points work →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
