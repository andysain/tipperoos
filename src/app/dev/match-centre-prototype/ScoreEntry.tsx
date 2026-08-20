"use client";

// Score entry.
//
// !! DIVERGES FROM PRODUCTION, DELIBERATELY. The shipped
// src/components/pick-board/TippedMatchCard.tsx files a pick on a tap with
// NO confirm step, awaits the write before showing "Filed" (never
// optimistic), and returns to an empty entry state with an inline error on
// rejection (ADR 0007 decision 2). This prototype fakes a 400ms save and
// cannot fail. Fine for judging layout; do NOT port this behaviour.
//
// Fixed in review:
//   * `5+` filed a literal 5. A player taps a control promising "five or
//     more", the match finishes 6-0, and they score nothing with no
//     explanation. The shipped TippedMatchCard gets this right (5+ opens a
//     numeric input); this had simplified it into a lie.
//   * ADR 0007 specifies the CLUB CODE above each row, not the full club
//     name -- which was being stated twice within 150px of itself.
//   * "Filed"/"Filing" is tax-return vocabulary.
//   * the standing instruction lived in a per-card slot, so it appeared
//     twice on one screen. It's hoisted to the section now.

import { useState } from "react";
import {
  T_CAPTION,
  T_LABEL,
  TEXT,
  TEXT_MUTED,
  LABEL,
  FOCUS,
  INSET,
} from "./shared";

const DIGITS = [0, 1, 2, 3, 4];

function DigitRow({
  code,
  value,
  onPick,
  disabled,
}: {
  code: string;
  value: number | null;
  onPick: (n: number) => void;
  disabled?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const isCustom = value !== null && value >= 5;

  return (
    <div className="flex flex-col gap-1.5">
      <span className={`${LABEL} ${TEXT_MUTED}`}>{code}</span>
      <div className="flex gap-1.5">
        {DIGITS.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => {
              setCustom(false);
              onPick(n);
            }}
            className={`flex h-11 flex-1 items-center justify-center rounded-btn-sm border text-base font-bold tabular-nums transition active:scale-[0.96] disabled:opacity-50 ${FOCUS} ${
              value === n
                ? "border-accent bg-accent text-accent-ink"
                : `border-paper-line bg-white ${TEXT} hover:border-accent/60`
            }`}
          >
            {n}
          </button>
        ))}
        {custom || isCustom ? (
          <input
            type="number"
            min={5}
            max={20}
            autoFocus
            defaultValue={isCustom ? value : undefined}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 5 && n <= 20) onPick(n);
            }}
            aria-label={`${code} goals, 5 or more`}
            className={`h-11 min-w-0 flex-1 rounded-btn-sm border border-accent bg-white text-center text-base font-bold tabular-nums ${TEXT} outline-none ${FOCUS}`}
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setCustom(true)}
            className={`flex h-11 flex-1 items-center justify-center rounded-btn-sm border border-dashed border-paper-line bg-white ${T_CAPTION} font-bold ${TEXT_MUTED} transition active:scale-[0.96] disabled:opacity-50 ${FOCUS}`}
          >
            5+
          </button>
        )}
      </div>
    </div>
  );
}

export function ScoreEntry({
  homeCode,
  awayCode,
  initial,
}: {
  homeCode: string;
  awayCode: string;
  initial?: { home: number; away: number };
}) {
  const [home, setHome] = useState<number | null>(initial?.home ?? null);
  const [away, setAway] = useState<number | null>(initial?.away ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initial !== undefined);

  function commit(nextHome: number | null, nextAway: number | null) {
    if (nextHome === null || nextAway === null) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
    }, 400);
  }

  return (
    <div className={`flex flex-col gap-3 bg-white ${INSET} py-3.5`}>
      <DigitRow
        code={homeCode}
        value={home}
        disabled={saving}
        onPick={(n) => {
          setHome(n);
          setSaved(false);
          commit(n, away);
        }}
      />
      <DigitRow
        code={awayCode}
        value={away}
        disabled={saving}
        onPick={(n) => {
          setAway(n);
          setSaved(false);
          commit(home, n);
        }}
      />
      {saving || saved ? (
        <span className={`${T_LABEL} font-bold ${TEXT_MUTED}`}>
          {saving ? "Saving…" : "Saved — you can change this until picks close"}
        </span>
      ) : null}
    </div>
  );
}
