"use client";

// PROTOTYPE CHROME -- issue #214, throwaway. Deliberately off-palette so it
// never reads as part of the design being judged. Top-right rather than the
// usual bottom bar, because G's tap card docks at the bottom.
//
// Hidden on a Production deployment by the route itself (page.tsx 404s
// there). NOT gated on NODE_ENV: a Vercel Preview is a production build, and
// Preview is exactly where this prototype is meant to be reviewed.

import { useState } from "react";
import type { ProtoPayload } from "./TableComparePrototype";

export const OPTION_DEFAULTS = {
  you: "",
  vs: "",
  q2: "label",
  q3: "both",
  q4: "dash",
  q5: "code",
  q6: "live",
  q8: "neither",
  q9: "paper",
  q10: "biggest",
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
    options: [
      ["dash", "—"],
      ["text", "Not eligible"],
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
            <p className="mt-1">
              Q1 (scale) and Q7 (ahead / level): switch players above. Record
              each pick in issue #214&apos;s thread.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
