"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import {
  BOLD_CALL_BONUS,
  MAX_BOLD_CALLS,
  PLACEMENT_POINTS_BY_DISTANCE,
  TABLE_BANDS,
} from "@/lib/scoring/predict-table";
import {
  MATCH_SCORING_TERMS,
  NO_PICK_POINTS,
  WRONG_WAY_ROUND_POINTS,
} from "./match-breakdown";

const bandBonusValues = [...new Set(TABLE_BANDS.map((band) => band.bonus))];

function ScoreTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-btn border border-paper-line">
      <table className="w-full min-w-[18rem] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  );
}

export function WeeklyScoringTable() {
  return (
    <ScoreTable>
      <thead className="bg-paper text-xs font-bold tracking-wide text-ink/60 uppercase">
        <tr>
          <th className="px-3 py-2">What matched</th>
          <th className="px-3 py-2 text-right">Points</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-paper-line text-ink">
        {MATCH_SCORING_TERMS.map((term) => (
          <tr key={term.label}>
            <td className="px-3 py-2">{term.label}</td>
            <td className="px-3 py-2 text-right font-extrabold text-success">
              +{term.points}
            </td>
          </tr>
        ))}
        <tr>
          <td className="px-3 py-2">Wrong Way Round</td>
          <td className="px-3 py-2 text-right font-extrabold text-success">
            +{WRONG_WAY_ROUND_POINTS}
          </td>
        </tr>
      </tbody>
    </ScoreTable>
  );
}

export function TableScoringTable() {
  return (
    <div className="flex flex-col gap-3">
      <ScoreTable>
        <thead className="bg-paper text-xs font-bold tracking-wide text-ink/60 uppercase">
          <tr>
            <th className="px-3 py-2">Club&apos;s actual Band</th>
            <th className="px-3 py-2 text-right">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-line text-ink">
          <tr>
            <td className="px-3 py-2">Right Band</td>
            <td className="px-3 py-2 text-right font-extrabold text-success">
              +{PLACEMENT_POINTS_BY_DISTANCE[0]}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2">1 Band away</td>
            <td className="px-3 py-2 text-right font-extrabold text-success">
              +{PLACEMENT_POINTS_BY_DISTANCE[1]}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2">2 Bands away</td>
            <td className="px-3 py-2 text-right font-extrabold text-success">
              +{PLACEMENT_POINTS_BY_DISTANCE[2]}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2">3+ Bands away or unplaced</td>
            <td className="px-3 py-2 text-right font-extrabold text-ink/45">
              {PLACEMENT_POINTS_BY_DISTANCE[3] ?? NO_PICK_POINTS}
            </td>
          </tr>
        </tbody>
      </ScoreTable>
      <p className="text-sm text-ink/65">
        An exact Band Bonus means every club in that Band is right. The order of
        clubs inside the Band does not matter.
      </p>
      <ScoreTable>
        <thead className="bg-paper text-xs font-bold tracking-wide text-ink/60 uppercase">
          <tr>
            <th className="px-3 py-2">Extra scoring</th>
            <th className="px-3 py-2 text-right">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-line text-ink">
          {bandBonusValues.map((bonus) => {
            const bands = TABLE_BANDS.filter((band) => band.bonus === bonus);
            return (
              <tr key={bonus}>
                <td className="px-3 py-2">
                  Exact {bands.map((band) => band.name).join(" / ")} Band
                </td>
                <td className="px-3 py-2 text-right font-extrabold text-success">
                  +{bonus}
                </td>
              </tr>
            );
          })}
          <tr>
            <td className="px-3 py-2">Each Bold Call (best 5)</td>
            <td className="px-3 py-2 text-right font-extrabold text-success">
              +{BOLD_CALL_BONUS}
            </td>
          </tr>
        </tbody>
      </ScoreTable>
      <p className="text-sm text-ink/65">
        A Bold Call is a correct club placement made by no more than roughly one
        in ten eligible players. Only the best {MAX_BOLD_CALLS} count.
      </p>
    </div>
  );
}

export function ScoringSummary({ kind }: { kind: "matches" | "table" }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const table = kind === "table";

  return (
    <section className="rounded-card bg-white shadow-card">
      <button
        type="button"
        className="flex min-h-12 w-full items-center gap-2 px-4 text-left font-bold text-ink"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          {table
            ? "How Predict the Table scoring works"
            : "How weekly scoring works"}
        </span>
        <ChevronDown
          className={`ml-auto size-5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={panelId}
          className="flex flex-col gap-3 border-t border-paper-line px-4 py-4 text-[1rem] text-ink/75"
        >
          {table ? (
            <>
              <p>
                You place all 20 clubs into seven Table Bands. Here is the full
                scoring ladder.
              </p>
              <TableScoringTable />
              <p className="text-sm text-ink/60">
                The Bands are {TABLE_BANDS.map((band) => band.name).join(", ")}.
              </p>
              <Link
                href={{ pathname: "/how-it-works", hash: "predict-the-table" }}
                className="font-bold text-ink underline"
              >
                See the worked examples →
              </Link>
            </>
          ) : (
            <>
              <p>
                Your weekly points come from the rows that match. They stack,
                except for Wrong Way Round, which is its own result.
              </p>
              <WeeklyScoringTable />
              <p className="text-sm text-ink/60">
                A missing pick scores {NO_PICK_POINTS}. It is never filled in
                for you.
              </p>
              <Link
                href={{
                  pathname: "/how-it-works",
                  hash: "how-your-pick-scores",
                }}
                className="font-bold text-ink underline"
              >
                See the worked examples →
              </Link>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
