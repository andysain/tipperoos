"use client";

import { useRouter } from "next/navigation";
import {
  TippedMatchCard,
  type TippedMatchCardState,
} from "@/components/pick-board/TippedMatchCard";
import type { PickBoardSlot } from "@/app/_lib/pick-board-access";
import { T } from "@/components/ui/tokens";

// Maps a loaded PickBoardSlot onto TippedMatchCard's states. `locked` is
// computed server-side (page.tsx, via isMatchLocked -- src/lib/**, so it
// can't be imported from this client component) and passed in rather than
// re-derived here, keeping the 5-minute lock constant defined in one place.
//
// TippedMatchCardState has a "live" kind, but nothing in this codebase
// syncs an in-progress score yet -- `matches.status` is only ever
// 'scheduled', 'completed' or 'postponed' (no live sync source exists).
// A locked-but-not-yet-completed match therefore renders as "locked"
// (own pick, no result) until result sync flips it to "completed" --
// "live" is intentionally never produced by this mapping today.

function buildCardState(
  slot: Extract<PickBoardSlot, { kind: "match" }>,
  locked: boolean,
): TippedMatchCardState {
  const ownHomeScore = slot.ownPick?.homeScore ?? null;
  const ownAwayScore = slot.ownPick?.awayScore ?? null;

  if (slot.match.status === "completed") {
    return {
      kind: "finished",
      homeScore: slot.match.homeScore ?? 0,
      awayScore: slot.match.awayScore ?? 0,
      ownHomeScore,
      ownAwayScore,
      points: slot.points,
    };
  }
  if (locked) {
    return { kind: "locked", ownHomeScore, ownAwayScore };
  }
  if (slot.ownPick) {
    return {
      kind: "filed",
      ownHomeScore: slot.ownPick.homeScore,
      ownAwayScore: slot.ownPick.awayScore,
    };
  }
  return { kind: "entry" };
}

async function savePick(matchId: string, homeScore: number, awayScore: number) {
  const response = await fetch("/api/picks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tipperoos-client": "1",
    },
    body: JSON.stringify({ matchId, homeScore, awayScore }),
  });
  if (!response.ok) {
    throw new Error("Couldn't save pick.");
  }
}

/** Minimal ink plate for a Skipped Slot or Voided Match -- ADR-0007 leaves
 * the exact presentation undrawn/deferred; this is an honest, undecorated
 * placeholder rather than blocking the route on that open design question. */
function UnsettledSlotPlate({
  label,
  detail,
}: {
  label: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-card bg-ink px-4 py-5 text-center text-paper">
      <span className={`${T.label} font-bold uppercase tracking-[0.06em] text-paper/60`}>
        {label}
      </span>
      <span className={`${T.dense} font-semibold text-paper/85`}>{detail}</span>
    </div>
  );
}

export function PickBoardSlotCard({
  slot,
  locked,
  nowIso,
  timeZone,
}: {
  slot: PickBoardSlot;
  locked: boolean;
  nowIso: string;
  timeZone: string;
}) {
  const router = useRouter();

  if (slot.kind === "skipped") {
    return (
      <UnsettledSlotPlate
        label="Skipped slot"
        detail="This fixture was postponed before picks opened -- no match here this week."
      />
    );
  }

  if (slot.voided) {
    return (
      <UnsettledSlotPlate
        label="Voided match"
        detail="Postponed after picks locked -- no points either way."
      />
    );
  }

  return (
    <TippedMatchCard
      home={slot.match.home}
      away={slot.match.away}
      kickoffUtcIso={slot.match.kickoffUtcIso}
      timeZone={timeZone}
      now={new Date(nowIso)}
      provenance={slot.provenance}
      state={buildCardState(slot, locked)}
      onSave={async (homeScore, awayScore) => {
        await savePick(slot.match.id, homeScore, awayScore);
        // page.tsx is a Server Component fetched fresh per request (ADR-0007) --
        // nothing else re-runs that fetch after a client-side save, so the
        // header would keep showing the pre-save state until a hard navigation
        // without this. router.refresh() re-runs the server fetch in place.
        router.refresh();
      }}
    />
  );
}
