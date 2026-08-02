"use client";

import { useMemo, useState } from "react";
import { tv } from "tailwind-variants";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  type BandKey,
  TABLE_BANDS,
  validateBandCounts,
} from "@/lib/table-predictions/rules";

interface Team {
  id: string;
  name: string;
  shortCode: string | null;
}

function teamsInBand(
  assignments: Record<string, BandKey>,
  band: BandKey,
): string[] {
  return Object.entries(assignments)
    .filter(([, b]) => b === band)
    .map(([teamId]) => teamId);
}

type BandTone = "success" | "info" | "warning" | "danger" | "neutral";

// Plain-language explanation + a decorative emoji per Band -- purely a
// personalization/delight layer (DESIGN_SYSTEM.md's "emoji stay the
// personalization layer" split, distinct from lucide-react's functional
// icon chrome), not new UI state. `tone` reuses the *existing* semantic
// palette (success/info/warning/danger) rather than inventing new colors --
// DESIGN_SYSTEM.md reserves `accent` for exactly two spots elsewhere, so
// Band personality has to come from copy/emoji/these reused tones instead.
const BAND_META: Record<
  BandKey,
  { emoji: string; blurb: string; tone: BandTone }
> = {
  champion: { emoji: "🏆", blurb: "Wins the whole league!", tone: "success" },
  champions_league: {
    emoji: "⭐",
    blurb: "Top 4 -- plays Champions League next season",
    tone: "success",
  },
  europe: {
    emoji: "✈️",
    blurb: "5th-8th -- Europa League or Conference League",
    tone: "info",
  },
  mid_table: {
    emoji: "😌",
    blurb: "Comfortably mid-table, nothing to worry about",
    tone: "neutral",
  },
  lower_table: {
    emoji: "😬",
    blurb: "Lower half -- could do with a good run of form",
    tone: "neutral",
  },
  relegation_battle: {
    emoji: "⚠️",
    blurb: "Fighting hard to stay in the league",
    tone: "warning",
  },
  relegated: {
    emoji: "⬇️",
    blurb: "Bottom 3 -- drops down a division",
    tone: "danger",
  },
};

const bandHeaderChip = tv({
  base: "inline-flex items-center gap-1.5 rounded-badge px-2.5 py-1 text-[0.8rem] font-bold tracking-[0.04em] text-ink uppercase",
  variants: {
    tone: {
      success: "bg-success/15",
      info: "bg-info/15",
      warning: "bg-warning/25",
      danger: "bg-danger/15",
      neutral: "bg-ink/8",
    },
  },
  defaultVariants: { tone: "neutral" },
});

const bandPickerRow = tv({
  base: "flex items-center gap-3 rounded-btn border border-paper-line bg-white px-3.5 py-2.5 text-left transition hover:border-accent/60 active:scale-[0.99]",
  variants: {
    tone: {
      success: "border-l-4 border-l-success",
      info: "border-l-4 border-l-info",
      warning: "border-l-4 border-l-warning",
      danger: "border-l-4 border-l-danger",
      neutral: "",
    },
  },
  defaultVariants: { tone: "neutral" },
});

const teamChip = tv({
  base: "rounded-badge border px-2.5 py-1 text-sm transition",
  variants: {
    state: {
      readonly: "border-paper-line bg-paper text-ink",
      interactive: "border-paper-line bg-paper text-ink hover:border-accent/60",
      selected: "border-accent bg-accent/20 text-ink",
      mismatch: "border-warning/60 bg-warning/10 text-ink",
    },
  },
  defaultVariants: { state: "readonly" },
});

interface PredictTableFlowProps {
  teams: Team[];
  initialAssignments: Record<string, BandKey>;
  isLateJoiner: boolean;
  locked: boolean;
  initialIsSkipped: boolean;
  initialSubmittedAt: string | null;
}

function TeamBadge({ team }: { team: Team }) {
  return (
    <span className="flex items-center gap-2">
      <span className="rounded-badge bg-ink/10 px-2 py-0.5 text-xs font-bold tracking-wide text-ink">
        {team.shortCode ?? "?"}
      </span>
      {team.name}
    </span>
  );
}

function BandHeader({
  band,
  mismatch,
}: {
  band: (typeof TABLE_BANDS)[number];
  mismatch?: { actual: number; expected: number };
}) {
  const meta = BAND_META[band.key];
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <span className={bandHeaderChip({ tone: meta.tone })}>
          <span aria-hidden>{meta.emoji}</span>
          {band.label}
        </span>
        <p className="mt-1 text-xs text-ink/60">{meta.blurb}</p>
      </div>
      {mismatch ? (
        <span className="mt-1 shrink-0 text-xs font-bold text-warning">
          {mismatch.actual} / {mismatch.expected}
        </span>
      ) : null}
    </div>
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

export function PredictTableFlow({
  teams,
  initialAssignments,
  isLateJoiner,
  locked,
  initialIsSkipped,
  initialSubmittedAt,
}: PredictTableFlowProps) {
  const [assignments, setAssignments] =
    useState<Record<string, BandKey>>(initialAssignments);
  const [isSkipped, setIsSkipped] = useState(initialIsSkipped);
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const teamsById = useMemo(
    () => new Map(teams.map((team) => [team.id, team])),
    [teams],
  );

  const unsorted = useMemo(
    () => teams.filter((team) => !(team.id in assignments)),
    [teams, assignments],
  );

  const counts = useMemo(() => {
    const result: Partial<Record<BandKey, number>> = {};
    for (const band of Object.values(assignments)) {
      result[band] = (result[band] ?? 0) + 1;
    }
    return result;
  }, [assignments]);

  const validation = useMemo(() => validateBandCounts(counts), [counts]);

  async function assignTeam(teamId: string, band: BandKey) {
    setSaveError(null);
    const previous = assignments;
    setAssignments((prev) => ({ ...prev, [teamId]: band }));
    setIsSkipped(false);
    setSelectedTeamId(null);

    const { ok, data } = await postJson("/api/table-predictions/assign", {
      teamId,
      band,
    });
    if (!ok) {
      setAssignments(previous);
      setSaveError(data.error ?? "Couldn't save that move -- try again.");
    }
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
    const { ok, data } = await postJson("/api/table-predictions/submit");
    if (ok) {
      setSubmittedAt(data.submittedAt);
    } else {
      setActionError(data.error ?? "Couldn't submit -- try again.");
    }
    setBusy(false);
  }

  if (locked) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <Card className="w-full max-w-md">
          <h1 className="text-[1.9rem] font-extrabold text-ink">
            Predict the Table
          </h1>
          <p className="mt-1 mb-6 text-ink/70">
            {Object.keys(assignments).length === 20
              ? "Locked in -- Gameweek 1 has kicked off."
              : "Gameweek 1 has kicked off, so this is locked. Here's what you had:"}
          </p>
          <BandSummary assignments={assignments} teamsById={teamsById} />
        </Card>
      </main>
    );
  }

  if (isSkipped) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
        <Card className="w-full max-w-md text-center">
          <h1 className="text-[1.9rem] font-extrabold text-ink">
            👋 You skipped Predict the Table
          </h1>
          <p className="mt-1 mb-6 text-ink/70">
            No worries -- you can still sort your table whenever you like.
          </p>
          <Button onClick={() => setIsSkipped(false)} fullWidth>
            Sort my table
          </Button>
        </Card>
      </main>
    );
  }

  const nextTeam = unsorted[0];

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-[1.9rem] font-extrabold text-ink">
          Predict the Table
        </h1>
        <p className="mt-1 text-ink/70">
          Where will each Premier League club finish this season? Sort all 20
          into these 7 groups, from title winners to relegation.
        </p>

        {isLateJoiner ? (
          <p className="mt-2 text-sm text-info">
            You joined after Gameweek 1 kicked off, so this one&apos;s totally
            optional -- submit whenever you like, or skip it.
          </p>
        ) : null}

        {submittedAt ? (
          <p className="mt-2 text-sm text-success">
            ⚽ Submitted -- you can keep editing until Gameweek 1 kicks off.
          </p>
        ) : null}

        {saveError ? (
          <p className="mt-2 text-sm text-danger">{saveError}</p>
        ) : null}

        <div className="mt-6">
          {nextTeam ? (
            <SortingCard
              team={nextTeam}
              sortedCount={teams.length - unsorted.length}
              totalCount={teams.length}
              onAssign={(band) => assignTeam(nextTeam.id, band)}
            />
          ) : (
            <ReviewBands
              assignments={assignments}
              teamsById={teamsById}
              selectedTeamId={selectedTeamId}
              onSelectTeam={setSelectedTeamId}
              onMoveTeam={assignTeam}
              validation={validation}
            />
          )}
        </div>

        {actionError ? (
          <p className="mt-4 text-sm text-danger">{actionError}</p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          {!nextTeam ? (
            <Button
              onClick={handleSubmit}
              disabled={!validation.ok || busy}
              fullWidth
            >
              {submittedAt ? "Re-submit" : "Submit my table"}
            </Button>
          ) : null}

          {isLateJoiner ? (
            <Button
              intent="ghost"
              onClick={handleSkip}
              disabled={busy}
              fullWidth
            >
              Skip for now
            </Button>
          ) : null}
        </div>
      </Card>
    </main>
  );
}

function SortingCard({
  team,
  sortedCount,
  totalCount,
  onAssign,
}: {
  team: Team;
  sortedCount: number;
  totalCount: number;
  onAssign: (band: BandKey) => void;
}) {
  return (
    <div>
      <p className="text-sm text-ink/60">
        {sortedCount} of {totalCount} sorted
      </p>
      <div className="mt-3 rounded-card border border-paper-line bg-paper p-6 text-center">
        <p className="text-[1.3rem] font-bold text-ink">
          <TeamBadge team={team} />
        </p>
        <p className="mt-1 text-sm text-ink/60">Where will they finish?</p>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {TABLE_BANDS.map((band) => {
          const meta = BAND_META[band.key];
          return (
            <button
              key={band.key}
              type="button"
              onClick={() => onAssign(band.key)}
              className={bandPickerRow({ tone: meta.tone })}
            >
              <span className="text-xl" aria-hidden>
                {meta.emoji}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-ink">
                  {band.label}
                </span>
                <span className="block text-xs text-ink/60">{meta.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BandSummary({
  assignments,
  teamsById,
}: {
  assignments: Record<string, BandKey>;
  teamsById: Map<string, Team>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {TABLE_BANDS.map((band) => {
        const teamIds = teamsInBand(assignments, band.key);
        return (
          <div key={band.key}>
            <BandHeader band={band} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {teamIds.length === 0 ? (
                <span className="text-sm text-ink/40">-</span>
              ) : (
                teamIds.map((teamId) => {
                  const team = teamsById.get(teamId);
                  if (!team) return null;
                  return (
                    <span
                      key={teamId}
                      className={teamChip({ state: "readonly" })}
                    >
                      <TeamBadge team={team} />
                    </span>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReviewBands({
  assignments,
  teamsById,
  selectedTeamId,
  onSelectTeam,
  onMoveTeam,
  validation,
}: {
  assignments: Record<string, BandKey>;
  teamsById: Map<string, Team>;
  selectedTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
  onMoveTeam: (teamId: string, band: BandKey) => void;
  validation: ReturnType<typeof validateBandCounts>;
}) {
  const mismatchByBand = new Map(validation.mismatches.map((m) => [m.band, m]));

  return (
    <div className="flex flex-col gap-4">
      {!validation.ok ? (
        <p className="text-sm text-warning">
          Some Bands don&apos;t match yet -- tap a team below to move it.
        </p>
      ) : (
        <p className="text-sm text-success">🎉 Every Band looks right!</p>
      )}

      {TABLE_BANDS.map((band) => {
        const teamIds = teamsInBand(assignments, band.key);
        const mismatch = mismatchByBand.get(band.key);

        return (
          <div key={band.key}>
            <BandHeader band={band} mismatch={mismatch} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {teamIds.map((teamId) => {
                const team = teamsById.get(teamId);
                if (!team) return null;
                const isSelected = selectedTeamId === teamId;
                return (
                  <button
                    key={teamId}
                    type="button"
                    onClick={() => onSelectTeam(isSelected ? null : teamId)}
                    className={teamChip({
                      state: isSelected
                        ? "selected"
                        : mismatch
                          ? "mismatch"
                          : "interactive",
                    })}
                  >
                    <TeamBadge team={team} />
                  </button>
                );
              })}
            </div>
            {selectedTeamId && teamIds.includes(selectedTeamId) ? (
              <div className="mt-2 flex flex-wrap gap-1.5 rounded-btn bg-paper p-2">
                <span className="w-full text-xs text-ink/60">Move to:</span>
                {TABLE_BANDS.filter((b) => b.key !== band.key).map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => onMoveTeam(selectedTeamId, b.key)}
                    className="flex items-center gap-1.5 rounded-btn-sm border border-paper-line bg-white px-2.5 py-1.5 text-xs font-bold text-ink hover:border-accent/60"
                  >
                    <span aria-hidden>{BAND_META[b.key].emoji}</span>
                    {b.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
