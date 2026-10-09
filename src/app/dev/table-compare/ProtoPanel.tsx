"use client";

// PROTOTYPE CHROME -- issue #214, throwaway. Deliberately off-palette so it
// never reads as part of the design being judged. Top-right rather than the
// usual bottom bar, because G's tap card docks at the bottom.
//
// Hidden on a Production deployment by the route itself (page.tsx 404s
// there). NOT gated on NODE_ENV: a Vercel Preview is a production build, and
// Preview is exactly where this prototype is meant to be reviewed.

import { useState } from "react";
import { bandIndexForRank } from "@/lib/scoring/predict-table";
import type { ProtoPayload } from "./TableComparePrototype";
import { headerSentence, totals, type SentenceRule } from "./view";

export const OPTION_DEFAULTS = {
  you: "",
  vs: "",
  q2: "label",
  q3: "both",
  q4: "text",
  q4b: "name",
  q5: "code",
  q6: "live",
  q8: "neither",
  q9: "paper",
  q10: "biggest",
  q11: "icons",
};
export type Options = Record<keyof typeof OPTION_DEFAULTS, string>;

const QUESTIONS: {
  key: keyof Options;
  title: string;
  options: [string, string][];
}[] = [
  {
    key: "q2",
    title: "Q2 · Club never placed",
    options: [
      ["label", "“Not placed” in lane"],
      ["blank", "Empty lane"],
    ],
  },
  {
    key: "q3",
    title: "Q3 · Per-row Bold Call ★",
    options: [
      ["both", "Both"],
      ["you", "Only you"],
      ["none", "Neither"],
    ],
  },
  {
    key: "q4",
    title: "Q4 · Late Joiner's Bold Calls cell",
    // No dash option: DESIGN.md never uses a dash for a missing value.
    options: [
      ["text", "Not eligible"],
      ["zero", "0 (badge explains)"],
    ],
  },
  {
    key: "q4b",
    title: "Q4 · Late badge goes",
    options: [
      ["name", "By the name"],
      ["column", "On the table column"],
    ],
  },
  {
    key: "q5",
    title: "Q5 · Row label",
    options: [
      ["code", "Code"],
      ["name", "Name"],
    ],
  },
  {
    key: "q6",
    title: "Q6 · Standings",
    options: [
      ["live", "Real"],
      ["none", "Sim: no sync"],
      ["stale", "Sim: stale"],
    ],
  },
  {
    key: "q8",
    title: "Q8 · Level row/total",
    options: [
      ["neither", "No green"],
      ["both", "Both green"],
    ],
  },
  {
    key: "q9",
    title: "Q9 · Header ground",
    options: [
      ["paper", "Paper"],
      ["ink", "Ink, no green"],
    ],
  },
  {
    key: "q10",
    title: "Q10 · Header sentence rule",
    options: [
      ["biggest", "Biggest part"],
      ["bands", "Bands first"],
      ["none", "Numbers only"],
    ],
  },
  {
    key: "q11",
    title: "Q11 · Axis labels (new: icons don't name a column on touch)",
    options: [
      ["icons", "Band icons"],
      ["positions", "Positions, stacked"],
    ],
  },
];

const STATUS_LABEL: Record<string, string> = {
  submitted: "",
  skipped: " — skipped",
  unsubmitted: " — un-submitted",
  none: " — no table",
};

export function ProtoPanel({
  payload,
  options,
  setOption,
  youId,
  vsId,
}: {
  payload: ProtoPayload;
  options: Options;
  setOption: (key: keyof Options, value: string) => void;
  youId: string;
  vsId: string;
}) {
  const [open, setOpen] = useState(false);

  const describe = (id: string) => {
    const p = payload.players.find((x) => x.id === id);
    if (!p) return "—";
    const live = payload.scores[id]?.totalScore;
    return `${p.displayName}: read-time ${live ?? "—"} · stored ${p.storedTotal ?? "—"}${p.isLateJoiner ? " · Late" : ""}`;
  };

  // P4: every staging table, wildest first, so Q1's worst case is one tap
  // away. "Wildness" = total Band distance over placed clubs.
  const tables = payload.players
    .filter((p) => p.hasTable)
    .map((p) => {
      const bands = payload.bands[p.id] ?? {};
      let distance = 0;
      let unplaced = 0;
      payload.actualOrder.forEach((teamId, index) => {
        const predicted = bands[teamId];
        if (predicted === undefined) unplaced++;
        else distance += Math.abs(predicted - bandIndexForRank(index + 1));
      });
      return { player: p, distance, unplaced };
    })
    .sort((a, b) => b.distance - a.distance);

  // Q7: the same pair's sentence from both sides. Level is only reachable
  // with two tables on equal totals.
  const q7 = (() => {
    const a = payload.scores[youId];
    const b = payload.scores[vsId];
    if (!a || !b || payload.actualOrder.length !== 20) return null;
    const aBands = new Map(Object.entries(payload.bands[youId] ?? {}));
    const bBands = new Map(Object.entries(payload.bands[vsId] ?? {}));
    const aT = totals(a, aBands, payload.actualOrder);
    const bT = totals(b, bBands, payload.actualOrder);
    const name = (id: string) =>
      payload.players.find((p) => p.id === id)?.displayName ?? "?";
    const rule = options.q10 as SentenceRule;
    return [
      `As ${name(youId)}: ${headerSentence(rule, name(vsId), aT, bT)}`,
      `As ${name(vsId)}: ${headerSentence(rule, name(youId), bT, aT)}`,
    ];
  })();

  return (
    <div className="fixed top-2 right-2 z-40 flex max-w-[calc(100vw-1rem)] flex-col items-end gap-2 font-sans text-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-bold shadow-2xl ring-1 ring-white/25"
      >
        Prototype #214 {open ? "▴" : "▾"}
      </button>

      {open ? (
        <div className="max-h-[75vh] w-80 max-w-full overflow-y-auto rounded-2xl bg-neutral-900 p-3 text-xs shadow-2xl ring-1 ring-white/20">
          <label className="mb-2 flex flex-col gap-1">
            <span className="font-bold text-white/70">“You” are</span>
            <select
              value={youId}
              onChange={(e) => setOption("you", e.target.value)}
              className="rounded bg-neutral-800 px-2 py-1.5"
            >
              {payload.players.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.hasTable}>
                  {p.displayName}
                  {p.id === payload.viewerId ? " (signed in)" : ""}
                  {p.isLateJoiner ? " · Late" : ""}
                  {STATUS_LABEL[p.status]}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-3 flex flex-col gap-1">
            <span className="font-bold text-white/70">Compared with</span>
            <select
              value={vsId}
              onChange={(e) => setOption("vs", e.target.value)}
              className="rounded bg-neutral-800 px-2 py-1.5"
            >
              {payload.players
                .filter((p) => p.id !== youId)
                .map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.hasTable}>
                    {p.displayName}
                    {p.isLateJoiner ? " · Late" : ""}
                    {STATUS_LABEL[p.status]}
                    {p.hasTable
                      ? ` (${String(payload.scores[p.id]?.totalScore ?? "—")})`
                      : ""}
                  </option>
                ))}
            </select>
          </label>

          <div className="mb-3">
            <p className="mb-1 font-bold text-white/70">
              Every table (Q1), wildest first — tap to compare
            </p>
            <ul className="flex flex-col gap-0.5">
              {tables.map(({ player, distance, unplaced }) => (
                <li key={player.id}>
                  <button
                    type="button"
                    disabled={player.id === youId}
                    onClick={() => setOption("vs", player.id)}
                    className={`flex w-full justify-between rounded px-2 py-1 text-left ${
                      player.id === vsId
                        ? "bg-white text-neutral-900"
                        : "hover:bg-white/10 disabled:opacity-40"
                    }`}
                  >
                    <span>
                      {player.displayName}
                      {player.isLateJoiner ? " · Late" : ""}
                    </span>
                    <span className="tabular-nums">
                      {payload.scores[player.id]?.totalScore ?? "—"} pts ·{" "}
                      {distance} off
                      {unplaced > 0 ? ` · ${String(unplaced)} unplaced` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {QUESTIONS.map((q) => (
            <div key={q.key} className="mb-2.5">
              <p className="mb-1 font-bold text-white/70">{q.title}</p>
              <div className="flex flex-wrap gap-1">
                {q.options.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setOption(q.key, value)}
                    className={`rounded-full px-2.5 py-1 font-semibold ${
                      options[q.key] === value
                        ? "bg-white text-neutral-900"
                        : "bg-white/10 hover:bg-white/20"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-3 border-t border-white/15 pt-2 text-white/70">
            <p className="mb-1 font-bold">State</p>
            <p>{describe(youId)}</p>
            <p>{describe(vsId)}</p>
            <p>
              Standings:{" "}
              {payload.actualOrder.length === 20 ? "complete" : "incomplete"}
              {payload.standingsUpdatedAt
                ? ` · updated ${new Date(payload.standingsUpdatedAt).toLocaleString()}`
                : ""}
              {payload.standingsStale ? " · STALE" : ""}
              {payload.standingsPlayed
                ? ` · played ${String(payload.standingsPlayed.min)}–${String(payload.standingsPlayed.max)}`
                : ""}
            </p>
            <p>
              Bold Call cohort: {payload.eligibleCohortSize} · tables:{" "}
              {payload.players.filter((p) => p.hasTable).length}/
              {payload.players.length}
            </p>
            {q7 ? (
              <div className="mt-1">
                <p className="font-bold">Q7 · this pair, both sides</p>
                {q7.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
            <p className="mt-1">
              Record each pick in issue #214&apos;s thread.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
