"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { tv } from "tailwind-variants";
import {
  formatCountdown,
  formatKickoffInTimeZone,
} from "@/lib/dates/kickoff-format";
import { badgeTextColor, matchBadgeColors } from "@/lib/teams/kit-colors";

export interface TippedMatchTeam {
  name: string;
  shortCode: string | null;
  /** Rendered only when present -- CLAUDE.md: degrade to absent, not zero. */
  leaguePosition: number | null;
}

export type TippedMatchProvenance = "top_matchup" | "random_pick";

/**
 * The 5 states docs/adr/0007-home-surface-and-pick-entry.md draws for a
 * Tipped Match card. Skipped Slot and Voided Match presentation is
 * deferred by that ADR and out of this component's scope (issue #15
 * decision 7) -- the parent renders nothing in this card's place for
 * those, rather than this component growing extra kinds for them.
 */
export type TippedMatchCardState =
  | { kind: "entry" }
  | { kind: "filed"; ownHomeScore: number; ownAwayScore: number }
  | {
      kind: "locked";
      ownHomeScore: number | null;
      ownAwayScore: number | null;
    }
  | {
      kind: "live";
      homeScore: number;
      awayScore: number;
      ownHomeScore: number | null;
      ownAwayScore: number | null;
    }
  | {
      kind: "finished";
      homeScore: number;
      awayScore: number;
      ownHomeScore: number | null;
      ownAwayScore: number | null;
      points: number | null;
    };

export interface TippedMatchCardProps {
  home: TippedMatchTeam;
  away: TippedMatchTeam;
  kickoffUtcIso: string;
  /** IANA timezone to render kickoff/countdown in -- see kickoff-format.ts. */
  timeZone: string;
  now: Date;
  provenance: TippedMatchProvenance;
  state: TippedMatchCardState;
  /**
   * Awaited, not optimistic (issue #15 decision 2): the card disables
   * input and shows a "Filing…" stamp while this is pending, and on
   * rejection returns to an empty entry state with an inline error --
   * never shows "Filed" before the write is actually confirmed.
   */
  onSave: (homeScore: number, awayScore: number) => Promise<void>;
}

const provenanceLabel: Record<TippedMatchProvenance, string> = {
  top_matchup: "Top matchup",
  random_pick: "Random pick",
};

const digitCell = tv({
  base: "flex size-9 items-center justify-center rounded-btn-sm border border-paper-line bg-white text-base font-bold tabular-nums text-ink transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50",
  variants: {
    selected: {
      true: "border-accent bg-accent text-accent-ink",
      false: "hover:border-accent/60",
    },
  },
  defaultVariants: { selected: false },
});

function Badge({
  shortCode,
  fill,
}: {
  shortCode: string | null;
  fill: string;
}) {
  const textToken = badgeTextColor(fill);
  return (
    <span
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-badge text-[0.7rem] font-extrabold tracking-wide ${
        textToken === "ink" ? "text-ink" : "text-paper"
      }`}
      style={{ background: fill }}
      aria-hidden
    >
      {shortCode ?? "?"}
    </span>
  );
}

/** Rendered only when a position is present (CLAUDE.md: degrade to absent,
 * not zero) -- shown across every card state per the ADR ("Live league
 * position is shown ahead of each club"), not just entry. */
function PositionLabel({
  position,
  tone = "on-white",
}: {
  position: number | null;
  tone?: "on-white" | "on-ink";
}) {
  if (position === null) return null;
  return (
    <span
      className={`text-[0.7rem] font-bold tabular-nums ${
        tone === "on-white" ? "text-ink/55" : "text-paper/60"
      }`}
    >
      {position}
      {ordinalSuffix(position)}
    </span>
  );
}

function ordinalSuffix(n: number): string {
  const rem = n % 100;
  if (rem >= 11 && rem <= 13) return "th";
  return (["th", "st", "nd", "rd"] as const)[n % 10] ?? "th";
}

function DigitRow({
  team,
  fill,
  selected,
  expanded,
  disabled,
  onSelect,
  onExpand,
}: {
  team: TippedMatchTeam;
  fill: string;
  selected: number | null;
  expanded: boolean;
  disabled: boolean;
  onSelect: (value: number) => void;
  onExpand: () => void;
}) {
  const primaryDigits = [0, 1, 2, 3, 4];
  const extraDigits = [5, 6, 7, 8, 9];
  const showExtra = expanded || (selected !== null && selected >= 5);

  return (
    <div className="flex items-stretch gap-2">
      <span
        aria-hidden
        className="w-1 shrink-0 rounded-full"
        style={{ background: fill }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-extrabold tracking-wide text-ink">
            {team.shortCode ?? "?"}
          </span>
          <PositionLabel position={team.leaguePosition} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {primaryDigits.map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={disabled}
              aria-pressed={selected === digit}
              className={digitCell({ selected: selected === digit })}
              onClick={() => onSelect(digit)}
            >
              {digit}
            </button>
          ))}
          {!showExtra ? (
            <button
              type="button"
              disabled={disabled}
              className="flex h-9 items-center justify-center rounded-btn-sm border border-dashed border-paper-line px-2 text-xs font-bold text-ink/55 transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onExpand}
            >
              5+
            </button>
          ) : null}
        </div>
        {showExtra ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {extraDigits.map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={disabled}
                aria-pressed={selected === digit}
                className={digitCell({ selected: selected === digit })}
                onClick={() => onSelect(digit)}
              >
                {digit}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MetaLine({
  provenance,
  kickoffUtcIso,
  timeZone,
  now,
  showCountdown,
}: {
  provenance: TippedMatchProvenance;
  kickoffUtcIso: string;
  timeZone: string;
  now: Date;
  showCountdown: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7rem] font-medium text-ink/55">
      <span>{provenanceLabel[provenance]}</span>
      <span aria-hidden>·</span>
      <span>{formatKickoffInTimeZone(kickoffUtcIso, timeZone)}</span>
      {showCountdown ? (
        <>
          <span aria-hidden>·</span>
          <span>{formatCountdown(kickoffUtcIso, now.getTime())}</span>
        </>
      ) : null}
    </div>
  );
}

/** The dark ink plate every settled state (filed/locked/live/finished)
 * collapses to (docs/adr/0007): scoreline at display size, flanked by
 * both badges, home stated explicitly since order alone doesn't read as
 * "home" to every age group. */
function SettledPlate({
  home,
  away,
  homeFill,
  awayFill,
  homeScore,
  awayScore,
  scoreTone,
  points,
  locked,
}: {
  home: TippedMatchTeam;
  away: TippedMatchTeam;
  homeFill: string;
  awayFill: string;
  homeScore: number | null;
  awayScore: number | null;
  scoreTone: "own-pick" | "result";
  points: number | null;
  locked: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card bg-ink px-4 py-5 text-paper">
      <div className="flex w-full items-center justify-between text-[0.7rem] font-bold uppercase tracking-[0.06em] text-paper/60">
        <span>Home</span>
        {locked ? (
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3" strokeWidth={2} aria-hidden />
            {scoreTone === "own-pick" ? "Your pick" : null}
          </span>
        ) : null}
      </div>
      <div className="flex w-full items-center justify-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <Badge shortCode={home.shortCode} fill={homeFill} />
          <PositionLabel position={home.leaguePosition} tone="on-ink" />
        </div>
        <span
          className={`text-[clamp(2.5rem,7vw,3.25rem)] font-extrabold tabular-nums ${
            scoreTone === "own-pick" ? "text-accent" : "text-paper"
          }`}
        >
          {homeScore ?? "–"}–{awayScore ?? "–"}
        </span>
        <div className="flex flex-col items-center gap-1">
          <Badge shortCode={away.shortCode} fill={awayFill} />
          <PositionLabel position={away.leaguePosition} tone="on-ink" />
        </div>
      </div>
      {points !== null ? (
        <span className="rounded-badge bg-accent px-2.5 py-1 text-xs font-extrabold text-accent-ink">
          +{points} pts
        </span>
      ) : null}
    </div>
  );
}

export function TippedMatchCard({
  home,
  away,
  kickoffUtcIso,
  timeZone,
  now,
  provenance,
  state,
  onSave,
}: TippedMatchCardProps) {
  const [homeSelected, setHomeSelected] = useState<number | null>(null);
  const [awaySelected, setAwaySelected] = useState<number | null>(null);
  const [homeExpanded, setHomeExpanded] = useState(false);
  const [awayExpanded, setAwayExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { home: homeFill, away: awayFill } = matchBadgeColors(
    home.shortCode,
    away.shortCode,
  );

  async function fileIfComplete(
    nextHome: number | null,
    nextAway: number | null,
  ) {
    if (nextHome === null || nextAway === null) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(nextHome, nextAway);
      // Success: the parent owns pick data and is expected to flip `state`
      // to "filed" on its next render. Local selection stays as-is until
      // then (harmless -- it's about to be replaced by the settled plate).
    } catch {
      // A partial/failed pick is never restored (ADR) -- back to a clean
      // entry state, not a half-filled one, with a plain inline error line
      // (the deferred "tap to retry" stamp treatment is out of scope).
      setHomeSelected(null);
      setAwaySelected(null);
      setHomeExpanded(false);
      setAwayExpanded(false);
      setError(
        "Couldn't save your pick -- check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (state.kind === "entry") {
    return (
      <div className="flex flex-col gap-3 rounded-card border border-paper-line bg-white p-4 shadow-[0_10px_24px_-12px_rgba(18,60,67,0.28)]">
        <MetaLine
          provenance={provenance}
          kickoffUtcIso={kickoffUtcIso}
          timeZone={timeZone}
          now={now}
          showCountdown
        />
        <DigitRow
          team={home}
          fill={homeFill}
          selected={homeSelected}
          expanded={homeExpanded}
          disabled={saving}
          onSelect={(value) => {
            setHomeSelected(value);
            void fileIfComplete(value, awaySelected);
          }}
          onExpand={() => setHomeExpanded(true)}
        />
        <DigitRow
          team={away}
          fill={awayFill}
          selected={awaySelected}
          expanded={awayExpanded}
          disabled={saving}
          onSelect={(value) => {
            setAwaySelected(value);
            void fileIfComplete(homeSelected, value);
          }}
          onExpand={() => setAwayExpanded(true)}
        />
        {saving ? (
          <p className="text-xs font-semibold text-ink/55">Filing…</p>
        ) : null}
        {error ? (
          <p className="text-xs font-semibold text-danger">{error}</p>
        ) : null}
      </div>
    );
  }

  const plateProps = (() => {
    switch (state.kind) {
      case "filed":
        return {
          homeScore: state.ownHomeScore,
          awayScore: state.ownAwayScore,
          scoreTone: "own-pick" as const,
          points: null,
          locked: false,
        };
      case "locked":
        return {
          homeScore: state.ownHomeScore,
          awayScore: state.ownAwayScore,
          scoreTone: "own-pick" as const,
          points: null,
          locked: true,
        };
      case "live":
        return {
          homeScore: state.homeScore,
          awayScore: state.awayScore,
          scoreTone: "result" as const,
          points: null,
          locked: true,
        };
      case "finished":
        return {
          homeScore: state.homeScore,
          awayScore: state.awayScore,
          scoreTone: "result" as const,
          points: state.points,
          locked: true,
        };
    }
  })();

  return (
    <div className="flex flex-col gap-2">
      <MetaLine
        provenance={provenance}
        kickoffUtcIso={kickoffUtcIso}
        timeZone={timeZone}
        now={now}
        showCountdown={false}
      />
      <SettledPlate
        home={home}
        away={away}
        homeFill={homeFill}
        awayFill={awayFill}
        {...plateProps}
      />
    </div>
  );
}
