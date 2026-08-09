"use client";

// Temporary dev-only harness (issue #15): #90 (the real home page wiring
// this card into `/`) hasn't been built yet, so this route exists purely to
// manually exercise every TippedMatchCard state per this issue's own
// "Done when" -- not linked from nav, not a deliverable of #90. Safe to
// delete once #90 supersedes it.

import { useState } from "react";
import {
  TippedMatchCard,
  type TippedMatchCardState,
} from "@/components/pick-board/TippedMatchCard";

// Fixed, not `new Date()` -- a live clock here would SSR/hydration-mismatch
// (server render and client hydrate at slightly different instants).
const HOME = { name: "Arsenal", shortCode: "ARS", leaguePosition: 2 };
const AWAY = { name: "Chelsea", shortCode: "CHE", leaguePosition: 6 };
const NOW = new Date("2026-08-09T12:00:00.000Z");
const KICKOFF_SOON = "2026-08-09T15:00:00.000Z";
const KICKOFF_PAST = "2026-08-09T10:30:00.000Z";

function EntryHarness() {
  const [failNext, setFailNext] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={failNext}
          onChange={(e) => setFailNext(e.target.checked)}
        />
        Simulate save failure
      </label>
      <TippedMatchCard
        home={HOME}
        away={AWAY}
        kickoffUtcIso={KICKOFF_SOON}
        timeZone="Australia/Sydney"
        now={NOW}
        provenance="top_matchup"
        state={{ kind: "entry" }}
        onSave={async () => {
          await new Promise((resolve) => setTimeout(resolve, 600));
          if (failNext) throw new Error("simulated failure");
        }}
      />
    </div>
  );
}

const SETTLED_STATES: { label: string; state: TippedMatchCardState }[] = [
  {
    label: "filed",
    state: { kind: "filed", ownHomeScore: 2, ownAwayScore: 1 },
  },
  {
    label: "locked",
    state: { kind: "locked", ownHomeScore: 2, ownAwayScore: 1 },
  },
  {
    label: "locked (never picked)",
    state: { kind: "locked", ownHomeScore: null, ownAwayScore: null },
  },
  {
    label: "live",
    state: {
      kind: "live",
      homeScore: 1,
      awayScore: 1,
      ownHomeScore: 2,
      ownAwayScore: 1,
    },
  },
  {
    label: "finished",
    state: {
      kind: "finished",
      homeScore: 2,
      awayScore: 1,
      ownHomeScore: 2,
      ownAwayScore: 1,
      points: 9,
    },
  },
];

export default function TippedMatchCardHarness() {
  return (
    <div className="flex flex-col gap-8 bg-paper p-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink/60">
          entry
        </h2>
        <EntryHarness />
      </section>
      {SETTLED_STATES.map(({ label, state }) => (
        <section key={label} className="flex flex-col gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink/60">
            {label}
          </h2>
          <TippedMatchCard
            home={HOME}
            away={AWAY}
            kickoffUtcIso={KICKOFF_PAST}
            timeZone="Australia/Sydney"
            now={NOW}
            provenance="random_pick"
            state={state}
            onSave={async () => {}}
          />
        </section>
      ))}
    </div>
  );
}
