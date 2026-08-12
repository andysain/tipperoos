"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  bandPosition,
  dropInto,
  modeFor,
  nextUnfilledBand,
  rosterOrder,
  startAgain as startAgainBoard,
  tapWhileFilling,
  type Assignments,
  type PriorBandByTeam,
} from "@/lib/table-predictions/board";
import {
  TABLE_BANDS,
  type BandKey,
  validateBandCounts,
} from "@/lib/table-predictions/rules";
import { BandSummary } from "./BandSummary";
import { BandsBoard } from "./BandsBoard";
import { SealedMoment } from "./SealedMoment";
import { BAND_LABEL, type Team } from "./shared";

function formatCountdown(msRemaining: number): string {
  const totalMinutes = Math.max(0, Math.floor(msRemaining / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// A live "locks in" readout -- DESIGN_SYSTEM.md's palette table already
// reserves `warning` for exactly this ("Locks-soon countdown"), just not
// wired up anywhere yet. Only ever shown to on-time players before lock --
// Late Joiners are never locked (CLAUDE.md).
function LockCountdown({ kickoffIso, now }: { kickoffIso: string; now: number }) {
  const remainingMs = new Date(kickoffIso).getTime() - now;
  if (remainingMs <= 0) return null;
  const soon = remainingMs < 24 * 60 * 60 * 1000;
  return (
    <span className={soon ? "text-warning" : "text-ink/50"}>
      Locks in {formatCountdown(remainingMs)}
    </span>
  );
}

async function postJson(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tipperoos-client": "1",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

interface PredictTableFlowProps {
  teams: Team[];
  initialAssignments: Record<string, BandKey>;
  isLateJoiner: boolean;
  locked: boolean;
  initialIsSkipped: boolean;
  initialSubmittedAt: string | null;
  gameweekOneKickoff: string | null;
}

export function PredictTableFlow({
  teams,
  initialAssignments,
  isLateJoiner,
  locked,
  initialIsSkipped,
  initialSubmittedAt,
  gameweekOneKickoff,
}: PredictTableFlowProps) {
  const [assignments, setAssignments] = useState<Assignments>(initialAssignments);
  const [previous, setPrevious] = useState<PriorBandByTeam>({});
  // Which Band is armed while filling -- always Champion on load. Which Band
  // opens on a *return* visit is #118's scope (return-visit landing), not
  // this one's.
  const [openBand, setOpenBand] = useState<BandKey>("champion");
  const [lifted, setLifted] = useState<string | null>(null);
  const [undo, setUndo] = useState<{
    teamId: string;
    band: BandKey;
    label: string;
  } | null>(null);

  const [isSkipped, setIsSkipped] = useState(initialIsSkipped);
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSealed, setJustSealed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const [warnedIncomplete, setWarnedIncomplete] = useState(false);
  const [confirmingStartAgain, setConfirmingStartAgain] = useState(false);
  const [startingAgain, setStartingAgain] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const teamsById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  );

  // Fixed roster order, per docs/predict-table-capture-spec.md "The
  // roster": last season's finishing position, promoted clubs last. Never
  // re-sorted by placement, so a club stays where the player learned it was.
  const roster = useMemo(() => rosterOrder(teams), [teams]);

  const placedCount = Object.keys(assignments).length;
  const mode = modeFor(placedCount, teams.length);

  const counts = useMemo(() => {
    const result: Partial<Record<BandKey, number>> = {};
    for (const band of Object.values(assignments)) {
      result[band] = (result[band] ?? 0) + 1;
    }
    return result;
  }, [assignments]);
  const validation = useMemo(() => validateBandCounts(counts), [counts]);

  // Only meaningful while filling -- review mode has no single open Band to
  // report a position for or advance from (issue #130).
  const nextBand =
    mode === "filling" ? nextUnfilledBand(openBand, counts) : null;

  // Applies a tap's computed board change optimistically, fires the one
  // request it implies (assign if the team landed in a Band, unassign if
  // it landed back in the roster), and rolls the change back on failure.
  async function persistTap(
    teamId: string,
    result: {
      assignments: Assignments;
      previous: PriorBandByTeam;
      movedFrom: BandKey | null;
    },
  ) {
    if (busyTeamId === teamId) return;
    setBusyTeamId(teamId);
    setSaveError(null);
    const prevAssignments = assignments;
    const prevPrevious = previous;
    setAssignments(result.assignments);
    setPrevious(result.previous);
    if (result.movedFrom) {
      const team = teamsById.get(teamId);
      setUndo({
        teamId,
        band: result.movedFrom,
        label: `${team?.name ?? "That team"} moved from ${BAND_LABEL[result.movedFrom]}`,
      });
    } else {
      setUndo(null);
    }

    const nextBand = result.assignments[teamId];
    const { ok, data } = nextBand
      ? await postJson("/api/table-predictions/assign", {
          teamId,
          band: nextBand,
        })
      : await postJson("/api/table-predictions/unassign", { teamId });

    if (!ok) {
      setAssignments(prevAssignments);
      setPrevious(prevPrevious);
      setUndo(null);
      setSaveError(data.error ?? "Couldn't save that move -- try again.");
    } else {
      setIsSkipped(false);
    }
    setBusyTeamId(null);
  }

  function handleTeamTap(teamId: string) {
    if (mode === "review") {
      setLifted((prev) => (prev === teamId ? null : teamId));
      return;
    }
    const result = tapWhileFilling({ assignments, previous }, teamId, openBand);
    void persistTap(teamId, result);
  }

  function handleDropInto(band: BandKey) {
    if (!lifted) return;
    const teamId = lifted;
    const result = dropInto({ assignments, previous }, teamId, band);
    setLifted(null);
    void persistTap(teamId, result);
  }

  function handleUndo() {
    if (!undo) return;
    const { teamId, band } = undo;
    setUndo(null);
    const result = dropInto({ assignments, previous }, teamId, band);
    void persistTap(teamId, result);
  }

  async function handleStartAgain() {
    setConfirmingStartAgain(false);
    setStartingAgain(true);
    setSaveError(null);
    const teamIds = Object.keys(assignments);
    const prevAssignments = assignments;
    const prevPrevious = previous;
    const cleared = startAgainBoard();
    setAssignments(cleared.assignments);
    setPrevious(cleared.previous);
    setUndo(null);
    setLifted(null);
    setOpenBand("champion");

    const results = await Promise.all(
      teamIds.map((teamId) =>
        postJson("/api/table-predictions/unassign", { teamId }),
      ),
    );
    const failed = results.find((result) => !result.ok);
    if (failed) {
      setAssignments(prevAssignments);
      setPrevious(prevPrevious);
      setSaveError("Couldn't start again -- check your connection and try again.");
    }
    setStartingAgain(false);
  }

  async function handleSkip() {
    setBusy(true);
    setActionError(null);
    const { ok, data } = await postJson("/api/table-predictions/skip");
    if (ok) {
      setIsSkipped(true);
    } else {
      setActionError(data.error ?? "Couldn't skip -- try again.");
    }
    setBusy(false);
  }

  async function handleSubmit() {
    setBusy(true);
    setActionError(null);
    setWarnedIncomplete(false);
    const { ok, data } = await postJson("/api/table-predictions/submit");
    if (ok) {
      setSubmittedAt(data.submittedAt);
      setJustSealed(true);
    } else {
      setActionError(data.error ?? "Couldn't submit -- try again.");
    }
    setBusy(false);
  }

  function handleSealClick() {
    if (validation.ok) {
      void handleSubmit();
      return;
    }
    setWarnedIncomplete(true);
  }

  if (locked) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
        <h1 className="text-[1.9rem] font-extrabold text-ink">
          Predict the Table
        </h1>
        <p className="text-ink/70">
          {placedCount === teams.length
            ? "Locked in -- Gameweek 1 has kicked off."
            : "Gameweek 1 has kicked off, so this is locked. Here's what you had:"}
        </p>
        <BandSummary assignments={assignments} teamsById={teamsById} />
      </main>
    );
  }

  if (isSkipped) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
        <h1 className="text-[1.9rem] font-extrabold text-ink">
          You skipped Predict the Table
        </h1>
        <p className="text-ink/70">
          No worries -- you can still call your table whenever you like.
        </p>
        <Button
          onClick={() => setIsSkipped(false)}
          fullWidth
          className="max-w-md"
        >
          Call my table
        </Button>
      </main>
    );
  }

  const mismatchCount = validation.mismatches.length;

  return (
    <main className="relative mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      <h1 className="text-[1.9rem] font-extrabold text-ink">
        Predict the Table
      </h1>
      <p className="-mt-2 text-ink/70">
        Where will each Premier League club finish? Tap a Band to open it,
        then tap clubs to add them.
      </p>

      <div className="-mt-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-ink/50">
          <span>
            {placedCount} of {teams.length} placed
          </span>
          {mode === "filling" ? (
            <>
              <span aria-hidden>&middot;</span>
              <span>
                Band {bandPosition(openBand)} of {TABLE_BANDS.length}
              </span>
            </>
          ) : null}
          {!locked && !isLateJoiner && gameweekOneKickoff ? (
            <>
              <span aria-hidden>&middot;</span>
              <LockCountdown kickoffIso={gameweekOneKickoff} now={now} />
            </>
          ) : null}
        </p>

        {placedCount > 0 ? (
          confirmingStartAgain ? (
            <span className="flex shrink-0 items-center gap-2 text-xs font-bold">
              <span className="text-ink/60">Start again?</span>
              <button
                type="button"
                onClick={handleStartAgain}
                disabled={startingAgain}
                className="-my-3 flex h-11 min-w-11 items-center justify-center px-2 text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingStartAgain(false)}
                className="-my-3 flex h-11 min-w-11 items-center justify-center px-2 text-ink/50 hover:text-ink"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingStartAgain(true)}
              disabled={startingAgain}
              className="-my-3 flex h-11 min-w-11 shrink-0 items-center justify-center px-2 text-xs font-bold text-ink/50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start again
            </button>
          )
        ) : null}
      </div>

      {isLateJoiner ? (
        <p className="-mt-2 text-sm text-info">
          You joined after Gameweek 1 kicked off, so this one&apos;s totally
          optional -- submit whenever you like, or skip it.
        </p>
      ) : null}

      {submittedAt ? (
        <p className="-mt-2 flex items-center gap-1.5 text-sm text-success">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          Submitted -- you can keep editing until Gameweek 1 kicks off.
        </p>
      ) : null}

      {saveError ? (
        <p role="alert" className="-mt-2 text-sm text-danger">
          {saveError}
        </p>
      ) : null}

      <BandsBoard
        mode={mode}
        teams={roster}
        teamsById={teamsById}
        assignments={assignments}
        openBand={openBand}
        nextBand={nextBand}
        lifted={lifted}
        busyTeamId={busyTeamId}
        undo={undo}
        onOpenBand={setOpenBand}
        onTapTeam={handleTeamTap}
        onDropInto={handleDropInto}
        onUndo={handleUndo}
      />

      {actionError ? (
        <p role="alert" className="text-sm text-danger">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {warnedIncomplete && !validation.ok ? (
          <div className="rounded-card border border-paper-line bg-white p-3">
            <p className="mb-2 text-sm text-ink">
              {mismatchCount} Band{mismatchCount > 1 ? "s aren't" : " isn't"}{" "}
              the right size -- you&apos;ll miss {mismatchCount} Band
              Bonus{mismatchCount > 1 ? "es" : ""}. Seal it anyway?
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={busy}
                fullWidth
                intent="secondary"
              >
                Seal it anyway
              </Button>
              <Button
                onClick={() => setWarnedIncomplete(false)}
                disabled={busy}
                fullWidth
                intent="ghost"
              >
                Let me fix it
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={handleSealClick}
            disabled={busy}
            fullWidth
            className="max-w-md"
          >
            {submittedAt ? "Re-seal my table" : "Seal my table"}
          </Button>
        )}

        {isLateJoiner ? (
          <Button
            intent="ghost"
            onClick={handleSkip}
            disabled={busy}
            fullWidth
            className="max-w-md"
          >
            Skip for now
          </Button>
        ) : null}
      </div>

      {justSealed ? (
        <SealedMoment
          assignments={assignments}
          teamsById={teamsById}
          onDismiss={() => setJustSealed(false)}
        />
      ) : null}
    </main>
  );
}
