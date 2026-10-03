"use client";

import { useRouter } from "next/navigation";
import {
  TippedMatchCard,
  type TippedMatchCardState,
} from "@/components/pick-board/TippedMatchCard";
import type { PickBoardSlot } from "@/app/_lib/pick-board-access";
import { MICRO_LABEL, T, TX } from "@/components/ui/tokens";
import { lockInstantIso } from "@/lib/competitions/lock-window";
import {
  describePickSaveFailure,
  PickSaveError,
} from "@/components/pick-board/pick-save-error";

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

async function savePick(
  matchId: string,
  homeScore: number,
  awayScore: number,
  context: { kickoffUtcIso: string; timeZone: string },
) {
  let response: Response;
  try {
    response = await fetch("/api/picks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tipperoos-client": "1",
      },
      body: JSON.stringify({ matchId, homeScore, awayScore }),
    });
  } catch {
    throw new PickSaveError(
      describePickSaveFailure({ status: null, ...lockContext(context) }),
    );
  }
  if (!response.ok) {
    // The route's `code` is what tells "too late" apart from any other
    // 403; the message itself is written here, for players.
    const body = (await response.json().catch(() => null)) as {
      code?: string;
    } | null;
    throw new PickSaveError(
      describePickSaveFailure({
        status: response.status,
        code: body?.code ?? null,
        ...lockContext(context),
      }),
    );
  }
}

function lockContext(context: { kickoffUtcIso: string; timeZone: string }) {
  return {
    kickoffUtcIso: context.kickoffUtcIso,
    lockUtcIso: lockInstantIso(context.kickoffUtcIso),
    timeZone: context.timeZone,
  };
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
    <div className="flex flex-col items-center gap-1 rounded-card bg-ink px-4 py-5 text-center">
      <span className={`${MICRO_LABEL} ${TX.onInkMuted}`}>{label}</span>
      <span className={`${T.dense} font-semibold ${TX.onInk}`}>{detail}</span>
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
        label="No match here"
        detail="This one was postponed before picks closed, so there's one fewer match to pick this week."
      />
    );
  }

  if (slot.voided) {
    return (
      <UnsettledSlotPlate
        label="Called off"
        detail="Postponed after picks closed, so nobody gets points for this one."
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
        try {
          await savePick(slot.match.id, homeScore, awayScore, {
            kickoffUtcIso: slot.match.kickoffUtcIso,
            timeZone,
          });
        } catch (caught) {
          // Locked or stale: the server's view of this card has moved on,
          // so re-fetch it -- the card then renders its real state, with
          // the error line still saying why.
          if (
            caught instanceof PickSaveError &&
            (caught.failure.kind === "locked" ||
              caught.failure.kind === "stale")
          ) {
            router.refresh();
          }
          throw caught;
        }
        // page.tsx is a Server Component fetched fresh per request (ADR-0007) --
        // nothing else re-runs that fetch after a client-side save, so the
        // header would keep showing the pre-save state until a hard navigation
        // without this. router.refresh() re-runs the server fetch in place.
        router.refresh();
      }}
    />
  );
}
