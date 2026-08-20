"use client";

// PROTOTYPE -- throwaway, dev-only, not linked from nav (same convention as
// src/app/dev/tipped-match-card/). Does not survive into main.
//
// STABILISED. Every design question raised across five passes is now settled
// and baked in -- there are no variant toggles left. What remains switchable
// is STATE, not design: which surface you're on, where the week has got to,
// and whether the summaries have any data yet.
//
// ============================ SETTLED ============================
//
// Reveal
//   1. Consensus clusters -- identical scorelines collapse into one row, so
//      ~16 players read as ~5. Beat a home x away score grid and a
//      one-row-per-player points ladder.
//   2. Ordered correct-first, then by crowd size. Before a result exists it
//      falls through to crowd size, so the list reshuffles exactly once.
//   3. Non-pickers get a trailing "no pick" row; bots are dimmed, not hidden.
//
// Structure
//   4. Match Centre is a TENSE, not a destination: `/` is now, /gameweek/[n]
//      is any settled week. No fourth tab.
//   5. The archive is a CONTROL, not a page -- 38 chips carrying the
//      viewer's points, scroll to jump. There is no /gameweek index.
//   6. Two axes: match-first off the board, player-first off the leaderboard
//      row's existing tap-to-open panel.
//
// Home
//   7. Picks first, always -- ordered by cost of missing, not by frequency
//      of interest. "No pick, no points" is the only irreversible failure.
//   8. Two dense summary tiles above the slots, both doors: recap (3/5) and
//      season standing (2/5).
//   9. Recap carries the player's own week -- points for the round, and per
//      match the tip, the final, and what it scored (mini table, with a
//      YOU / FINAL header so the two scorelines can't be confused).
//  10. Standing leads on position + week-on-week movement; points and
//      per-week demoted.
//  11. No "still to pick" list. Naming people reads as pressure, a bare
//      count is noise, and the empty entry card is already the nudge.
//  12. The board is never quiet: CLAUDE.md:70 / ADR 0006 run selection as
//      soon as the previous week's matches complete, so the next pair opens
//      on the same sync cycle. `phase=next` shows that handover.
//
// Card
//  13. "Eyebrow" header -- meta above the teams, so the card ends on the
//      scoreline. "Locked in" no longer restates the LOCKED chip, and the
//      countdown replaces the kickoff timestamp rather than doubling it.
//
// Corrected along the way (both were states the system cannot reach)
//   -  `live`: mapProviderStatus() sends IN_PLAY/PAUSED to 'scheduled' and
//      writes scores only on FINISHED. Two post-lock states, not three.
//   -  `settled`: there is no week with nothing to pick (see 12).
//
// =================================================================

// ============================ THE PROBLEM ============================
//
// (For the summary section at the top of home -- ?variant=A|B|C.)
//
// WHO, AND WHEN. ~13 people and 3 bots, one family/friend group, ages 10+,
// over 38 gameweeks. Three occasions to open the app:
//
//   1. Pre-lock (Thu-Sat)   "I need to put my picks in."   High intent.
//   2. Post-result (Sun-Mon) "What did I get?"             High intent.
//   3. Mid-week (Tue-Wed)    "Anything happening?"         Low intent.
//
// The summary section serves (2) almost entirely. On (1) it is in the way,
// which is why the picks sit above it in the cost-of-missing ordering.
//
// WHAT THE PLAYER IS ACTUALLY ASKING. Not "what are my statistics". In a
// private family competition the questions, in the order people care:
//
//   a. How did I do this week?                  -- answered today
//   b. Did I beat [a specific person]?          -- NOT answered anywhere
//   c. Am I going up or down?                   -- answered today
//   d. Where am I overall?                      -- answered today
//   e. Did I beat the crowd (the Median Bot)?   -- NOT answered anywhere
//
// (b) is the emotional core of this product and the app is currently silent
// on it. (e) is the one comparison CONTEXT.md says means something -- "a bar
// to clear rather than a rival to beat".
//
// THE SECOND-TELLING PROBLEM. CLAUDE.md calls the post-result email "you
// scored X, you're now rank Y" the highest-leverage retention lever in the
// product. A player arriving from that email has ALREADY been told (a) and
// (d). A summary that restates them is a flat second telling. What the email
// cannot do is show the detail, or the comparison.
//
// THE STALENESS PROBLEM. The section renders identically on Sunday (when it
// is the headline) and on Wednesday (when it is last week's news occupying
// the best space on the page). A summary that never changes stops being read.
//
// SO: this section exists to answer, in one glance and without leaving home,
// "what happened, and where does that leave me?" -- for a player whose whole
// interaction is a 30-second weekly visit, and whose real question is
// comparative rather than absolute.
//
// CONSTRAINTS. Must not out-compete the picks. Must not become an analytics
// page (charts, streaks, trends -- banned) or a social feature beyond the
// leaderboard and Match Centre (banned). Must degrade to nothing on day one.
// Must be a door, not a dead end. ~110-140px of phone height.
//
// SETTLED, from the A/B/C pass:
// CORRECTED after review: decision 7 ("picks first") was never implemented
// -- decision 8 put the summary above the slots and the summary grew to
// 222px against a stated 110-140px budget, pushing half the entry controls
// off-screen on a pre-lock visit. The summary now sits BELOW the slots,
// which costs it nothing on the post-result visit it serves (a post-lock
// card collapses to ~112px).
//
//   Standings take C's ladder -- relative position, which is what answers
//   (b). ADR 0012 deferred exactly this ("12 behind the top") rather than
//   rejecting it. Always three rows; the "N points to catch X" caption is
//   gone, since the table already says it.
//
//   The recap is a MEDIAN of A and C. A carried the detail, C the
//   compression, and the detail is load-bearing: by the time a player next
//   opens the app the Pick Board has advanced to a new gameweek, so this
//   block is the ONLY place their own tip for the finished week still
//   exists. Keep the tip; drop A"s hero and its four-column header;
//   total goes inline on the header line. One shared "your pick → final"
//   legend replaces the per-column headers.
//
// STILL OPEN (?variant=single|dual): whether the two competitions -- tipping
// and Predict the Table -- stand side by side. They are separate titles with
// separate orders (CLAUDE.md: the table score is standalone), so they cannot
// share one ladder; dual means two ladders at ~185px each.
//
// =====================================================================

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "./PrototypeSwitcher";
import { HomeSurface } from "./HomeSurface";
import { GameweekSurface, LeaderboardSurface, RecordSurface } from "./Surfaces";
import { ChevronLeft, ChevronRight, CircleHelp, LogOut } from "lucide-react";
import {
  CURRENT_GW,
  VOIDED_GW,
  SKIPPED_GW,
  BLANK_GW,
  labelForGameweek,
} from "./season";
import { FOCUS, T_CAPTION, T_H1, TEXT, TEXT_MUTED } from "./shared";
import { SIGNED_IN } from "./fixture";

/** Where the week has got to. Not design variants -- real states. */
export type Phase = "entry" | "filed" | "locked" | "part_played" | "next";

export default function MatchCentrePrototype() {
  const router = useRouter();
  const params = useSearchParams();

  const surface = params.get("surface") ?? "home";
  const phase = (params.get("phase") ?? "entry") as Phase;
  const gw = Number(params.get("gw") ?? CURRENT_GW);
  const player = params.get("player") ?? SIGNED_IN;
  const empty = params.get("empty") === "1";

  // Recap states that only exist on particular weeks (CONTEXT.md requires
  // Voided Match and Skipped Slot to render distinctly, and "No pick, no
  // points" must not read as a zero).
  const RECAP_GW: Record<string, number | undefined> = {
    normal: undefined,
    voided: VOIDED_GW,
    skipped: SKIPPED_GW,
    blank: BLANK_GW,
  };
  const recapKey = params.get("recap") ?? "normal";

  // The summary section's three approaches -- see the PROBLEM block above.

  const set = useCallback(
    (entries: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(entries)) next.set(k, v);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  const go = useCallback(
    (target: string, gameweek?: number) =>
      set(
        gameweek === undefined
          ? { surface: target }
          : { surface: target, gw: String(gameweek) },
      ),
    [set],
  );

  // Back sits ABOVE the title -- back-then-title is the order every mobile
  // OS trains, and title-then-back made the h1 look like it belonged to the
  // screen you came from. Ghost button, not an underlined text link: nothing
  // else in the app is one, and it was an ~18px tap target with no focus ring.
  const back = (target: string, label: string) => (
    <button
      onClick={() => go(target)}
      className={`-ml-2 flex min-h-11 w-fit items-center gap-0.5 rounded-btn-sm px-2 text-[0.8rem] font-bold text-ink/60 hover:bg-ink/5 active:translate-y-px ${FOCUS}`}
    >
      <ChevronLeft className="size-4 stroke-ink/60" aria-hidden />
      {label}
    </button>
  );

  const title =
    surface === "home"
      ? "Pick Board"
      : surface === "record"
        ? "Picks"
        : surface === "leaderboard"
          ? "Leaderboard"
          : surface === "table"
            ? "Predict the Table"
            : `Gameweek ${gw}`;

  return (
    <div className="min-h-dvh bg-paper">
      <div className="mx-auto flex max-w-md flex-col gap-4 p-4 pb-44">
        {/* CLAUDE.md: "Every authenticated page has a persistent top-corner
            ? link to /how-it-works." None of these surfaces had one, which
            also left the app's vocabulary load with no door. */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            {surface === "home"
              ? null
              : surface === "record"
                ? back("leaderboard", "Leaderboard")
                : back("home", "Pick Board")}
            {surface === "home" ? null : (
              <header className="flex flex-col gap-0.5 px-1">
                <h1 className={`${T_H1} font-extrabold leading-tight ${TEXT}`}>
                  {title}
                </h1>
                {surface === "gameweek" ? (
                  <span className={`${T_CAPTION} ${TEXT_MUTED}`}>
                    {labelForGameweek(gw)}
                  </span>
                ) : null}
              </header>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <span
              className={`grid size-10 place-items-center rounded-full bg-paper ${TEXT_MUTED} shadow-[0_2px_8px_-4px_rgba(18,60,67,0.4)]`}
              aria-label="How it works"
            >
              <CircleHelp className="size-5" aria-hidden />
            </span>
            <span
              className={`grid size-10 place-items-center rounded-full bg-paper ${TEXT_MUTED} shadow-[0_2px_8px_-4px_rgba(18,60,67,0.4)]`}
              aria-label="Switch player"
            >
              <LogOut className="size-5" aria-hidden />
            </span>
          </div>
        </div>

        {surface === "home" ? (
          <HomeSurface
            phase={phase}
            recapGw={RECAP_GW[recapKey]}
            empty={empty}
            go={go}
          />
        ) : null}

        {surface === "gameweek" ? (
          <>
            <GameweekSurface gw={gw} onGw={(n) => set({ gw: String(n) })} />
            {/* Navigation was only at the TOP of a ~1,700px scroll: you
                finish the second match and scroll back 2.5 screens to move
                a week. This is where reading ends and the thumb already is. */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => gw > 1 && set({ gw: String(gw - 1) })}
                disabled={gw <= 1}
                className={`flex min-h-11 items-center gap-1 rounded-btn-sm px-2 ${T_CAPTION} font-bold ${TEXT_MUTED} disabled:opacity-40 ${FOCUS}`}
              >
                <ChevronLeft className="size-4" aria-hidden />
                Gameweek {gw - 1}
              </button>
              <button
                onClick={() => gw < CURRENT_GW && set({ gw: String(gw + 1) })}
                disabled={gw >= CURRENT_GW}
                className={`flex min-h-11 items-center gap-1 rounded-btn-sm px-2 ${T_CAPTION} font-bold ${TEXT_MUTED} disabled:opacity-40 ${FOCUS}`}
              >
                Gameweek {gw + 1}
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          </>
        ) : null}

        {surface === "leaderboard" ? (
          <LeaderboardSurface
            onOpenRecord={(id) => set({ surface: "record", player: id })}
          />
        ) : null}

        {surface === "record" ? (
          <RecordSurface
            playerId={player}
            onOpenGameweek={(n) => go("gameweek", n)}
          />
        ) : null}

        {surface === "table" ? (
          <p
            className={`rounded-card border border-dashed border-paper-line p-6 ${T_CAPTION} ${TEXT_MUTED}`}
          >
            The existing /predict-table route lives here — not prototyped, this
            door just proves where it leads.
          </p>
        ) : null}
      </div>

      <PrototypeSwitcher
        surface={surface}
        surfaces={["home", "gameweek", "leaderboard", "record"]}
        onSurface={(s) => set({ surface: s })}
        phase={phase}
        onPhase={(p) => set({ phase: p })}
        recap={recapKey}
        recaps={Object.keys(RECAP_GW)}
        onRecap={(r) => set({ recap: r })}
      />
    </div>
  );
}
