"use client";

// PROTOTYPE -- throwaway. Three structurally different variants of the
// Table Prediction Strip (the persistent Pick Board row that replaces
// TablePredictionPrompt), switchable via ?variant=A|B|C.
//
// Mounted here rather than on `/` because the real Pick Board needs auth
// and live data; the board around each variant below is built from the
// REAL neighbouring components (StatsStrip, LastWeekStrip, TippedMatchCard)
// with fake props, so the strip is judged against real density instead of
// in a vacuum. Not linked from nav. Delete once the design is folded in.

import { Suspense, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { StatsStrip } from "@/components/pick-board/StatsStrip";
import { LastWeekStrip } from "@/components/pick-board/LastWeekStrip";
import { TippedMatchCard } from "@/components/pick-board/TippedMatchCard";
import { ClubCodeBadge } from "@/components/ui/ClubCodeBadge";
import { kitColors } from "@/lib/teams/kit-colors";

// ---------------------------------------------------------------- fixtures

const NOW = new Date("2026-11-14T12:00:00.000Z");

const CHAMPION = { name: "Arsenal", shortCode: "ARS" };

/** Every state the Strip can be in, incl. the not-yet-built score state. */
type StripState =
  | { kind: "nudge" }
  | { kind: "submitted"; editable: true; untidyBands: number }
  | { kind: "submitted"; editable: false; position: number | null }
  | { kind: "scored"; position: number; score: number };

const STATES: { label: string; note?: string; state: StripState }[] = [
  { label: "1. Not submitted (editable)", state: { kind: "nudge" } },
  {
    label: "2. Submitted, editable, untidy Bands",
    state: { kind: "submitted", editable: true, untidyBands: 2 },
  },
  {
    label: "3. Submitted, editable, tidy",
    state: { kind: "submitted", editable: true, untidyBands: 0 },
  },
  {
    label: "4. Submitted, locked (the main all-season state)",
    state: { kind: "submitted", editable: false, position: 2 },
  },
  {
    label: "5. Submitted, locked, no standings yet",
    note: "degrades to name-only",
    state: { kind: "submitted", editable: false, position: null },
  },
  {
    label: "6. FUTURE: live Table Prediction Score",
    note: "not being built yet -- shown to check the row has room",
    state: { kind: "scored", position: 2, score: 118 },
  },
];

/** Position only exists once locked, or in the future scored state. */
function positionOf(state: StripState): number | null {
  if (state.kind === "scored") return state.position;
  if (state.kind === "submitted" && !state.editable) return state.position;
  return null;
}

// ------------------------------------------------------- variant A: inline

function VariantA({ state }: { state: StripState }) {
  const [fill] = kitColors(CHAMPION.shortCode);

  if (state.kind === "nudge") {
    return (
      <Link
        href="#"
        className="flex items-center justify-between gap-3 rounded-card bg-accent px-4 py-3 text-accent-ink"
      >
        <span className="text-sm font-bold">
          Your next step: predict the table!
        </span>
        <span className="text-sm font-extrabold underline underline-offset-2">
          Go now
        </span>
      </Link>
    );
  }

  const position = positionOf(state);

  return (
    <Link
      href="#"
      className="flex items-center gap-3 rounded-card border border-paper-line bg-white px-4 py-2.5"
    >
      <span className="text-[0.65rem] font-bold uppercase tracking-[0.06em] text-ink/50">
        Champion
      </span>
      <ClubCodeBadge shortCode={CHAMPION.shortCode} fill={fill} />
      <span className="truncate text-sm font-extrabold text-ink">
        {CHAMPION.name}
      </span>
      <span className="ml-auto flex items-center gap-2 tabular-nums">
        {position !== null ? (
          <span className="text-sm text-ink/60">now {ordinal(position)}</span>
        ) : null}
        {state.kind === "scored" ? (
          <span className="rounded-badge bg-accent px-2 py-0.5 text-sm font-extrabold text-accent-ink">
            {state.score} pts
          </span>
        ) : null}
      </span>
      {state.kind === "submitted" && state.editable ? (
        <span className="text-sm font-extrabold text-info underline underline-offset-2">
          Edit
        </span>
      ) : null}
    </Link>
  );
}

// ------------------------------- variant B: folded into the stats strip

function VariantB({ state }: { state: StripState }) {
  const [fill] = kitColors(CHAMPION.shortCode);

  if (state.kind === "nudge") {
    return (
      <Link
        href="#"
        className="flex items-center justify-between gap-3 rounded-card bg-accent px-4 py-3 text-accent-ink"
      >
        <span className="text-sm font-bold">
          Your next step: predict the table!
        </span>
        <span className="text-sm font-extrabold underline underline-offset-2">
          Go now
        </span>
      </Link>
    );
  }

  // No separate row at all -- the champion becomes a third cell alongside
  // rank and season points, so the Strip costs zero extra vertical space.
  const position = positionOf(state);

  return (
    <div className="flex items-center gap-4 rounded-card border border-paper-line bg-white px-4 py-3">
      <div className="flex flex-col">
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.06em] text-ink/50">
          Your rank
        </span>
        <span className="text-lg font-extrabold tabular-nums text-ink">
          4th
        </span>
      </div>
      <div className="h-8 w-px bg-paper-line" aria-hidden />
      <div className="flex flex-col">
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.06em] text-ink/50">
          Season points
        </span>
        <span className="text-lg font-extrabold tabular-nums text-ink">62</span>
      </div>
      <div className="h-8 w-px bg-paper-line" aria-hidden />
      <Link href="#" className="flex min-w-0 flex-col">
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.06em] text-ink/50">
          {state.kind === "scored"
            ? `Champion · ${state.score} pts`
            : "Champion"}
        </span>
        <span className="flex items-center gap-1.5">
          <ClubCodeBadge shortCode={CHAMPION.shortCode} fill={fill} />
          <span className="truncate text-lg font-extrabold text-ink">
            {position !== null ? ordinal(position) : CHAMPION.name}
          </span>
        </span>
      </Link>
    </div>
  );
}

// ------------------------------------------- variant C: mini card w/ meter

function VariantC({ state }: { state: StripState }) {
  const [fill, second] = kitColors(CHAMPION.shortCode);

  if (state.kind === "nudge") {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-paper-line bg-white p-4">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink/50">
          Predict the Table
        </span>
        <p className="text-sm text-ink/70">
          Sort all 20 clubs before 31 August to score up to 200 points.
        </p>
        <Link
          href="#"
          className="rounded-btn bg-accent px-3 py-2 text-center text-sm font-extrabold text-accent-ink"
        >
          Start now
        </Link>
      </div>
    );
  }

  const position = positionOf(state);

  return (
    <Link
      href="#"
      className="flex flex-col gap-2 rounded-card border border-paper-line bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink/50">
          Your champion
        </span>
        {state.kind === "scored" ? (
          <span className="text-sm font-extrabold tabular-nums text-accent">
            {state.score} / 200
          </span>
        ) : state.kind === "submitted" && state.editable ? (
          <span className="text-sm font-extrabold text-info underline underline-offset-2">
            Edit
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <span
          className="h-9 w-1.5 shrink-0 rounded-full"
          style={{ background: `linear-gradient(${fill}, ${second})` }}
          aria-hidden
        />
        <span className="text-lg font-extrabold text-ink">{CHAMPION.name}</span>
        {position !== null ? (
          <span className="ml-auto text-sm tabular-nums text-ink/60">
            now {ordinal(position)}
          </span>
        ) : null}
      </div>
      {state.kind === "scored" ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-line">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${(state.score / 200) * 100}%` }}
          />
        </div>
      ) : null}
      {state.kind === "submitted" && state.editable && state.untidyBands > 0 ? (
        <p className="text-xs text-ink/60">
          {state.untidyBands} Bands aren&apos;t full — Band Bonuses off.
        </p>
      ) : null}
    </Link>
  );
}

// --------------------------------------------------------------- scaffold

function ordinal(n: number): string {
  const rem = n % 100;
  const suffix =
    rem >= 11 && rem <= 13
      ? "th"
      : ((["th", "st", "nd", "rd"] as const)[n % 10] ?? "th");
  return `${n}${suffix}`;
}

const VARIANTS = {
  A: { name: "Inline row", render: VariantA },
  B: { name: "Stats-strip cell", render: VariantB },
  C: { name: "Mini card + meter", render: VariantC },
} as const;

type VariantKey = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as VariantKey[];

function Switcher({ current }: { current: VariantKey }) {
  const router = useRouter();
  const cycle = useCallback(
    (delta: number) => {
      const next =
        KEYS[(KEYS.indexOf(current) + delta + KEYS.length) % KEYS.length];
      // Cast: typedRoutes doesn't model search params on a literal href.
      router.replace(`/dev/table-prediction-strip?variant=${next}` as never);
    },
    [current, router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-4 py-2 text-paper shadow-lg">
      <button onClick={() => cycle(-1)} className="px-2 text-lg font-bold">
        ←
      </button>
      <span className="whitespace-nowrap text-sm font-bold">
        {current} — {VARIANTS[current].name}
      </span>
      <button onClick={() => cycle(1)} className="px-2 text-lg font-bold">
        →
      </button>
    </div>
  );
}

/** Real Pick Board neighbours, fake props -- density context only. */
function BoardContext({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 bg-paper p-4">
      <h1 className="text-[1.9rem] font-extrabold text-ink">Pick Board</h1>
      <StatsStrip stats={{ rank: 4, points: 62 } as never} />
      <LastWeekStrip
        summary={
          {
            gameweekNumber: 11,
            points: 7,
            matches: [
              {
                home: { name: "Everton", shortCode: "EVE" },
                away: { name: "Fulham", shortCode: "FUL" },
                homeScore: 2,
                awayScore: 1,
                voided: false,
              },
            ],
          } as never
        }
      />
      {children}
      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start md:gap-4">
        <TippedMatchCard
          home={{ name: "Arsenal", shortCode: "ARS", leaguePosition: 2 }}
          away={{ name: "Chelsea", shortCode: "CHE", leaguePosition: 6 }}
          kickoffUtcIso="2026-11-15T15:00:00.000Z"
          timeZone="Australia/Sydney"
          now={NOW}
          provenance="top_matchup"
          state={{ kind: "filed", ownHomeScore: 2, ownAwayScore: 1 }}
          onSave={async () => {}}
        />
        <TippedMatchCard
          home={{ name: "Brentford", shortCode: "BRE", leaguePosition: 12 }}
          away={{ name: "Sunderland", shortCode: "SUN", leaguePosition: 9 }}
          kickoffUtcIso="2026-11-15T15:00:00.000Z"
          timeZone="Australia/Sydney"
          now={NOW}
          provenance="random_pick"
          state={{ kind: "entry" }}
          onSave={async () => {}}
        />
      </div>
    </div>
  );
}

export default function TablePredictionStripPrototype() {
  // useSearchParams needs a Suspense boundary above it to prerender.
  return (
    <Suspense>
      <Prototype />
    </Suspense>
  );
}

function Prototype() {
  const params = useSearchParams();
  const raw = params.get("variant") ?? "A";
  const current: VariantKey = KEYS.includes(raw as VariantKey)
    ? (raw as VariantKey)
    : "A";
  const Render = VARIANTS[current].render;

  return (
    <>
      <div className="flex flex-col gap-8 pb-24">
        {STATES.map(({ label, note, state }) => (
          <section key={label} className="flex flex-col gap-1">
            <div className="mx-auto w-full max-w-4xl px-4 pt-4">
              <p className="text-xs font-bold uppercase tracking-wide text-ink/40">
                {label}
                {note ? ` — ${note}` : ""}
              </p>
            </div>
            <BoardContext>
              <Render state={state} />
            </BoardContext>
          </section>
        ))}
        <div className="mx-auto w-full max-w-4xl px-4">
          <p className="text-xs text-ink/40">
            Skipped, and submitted-with-no-champion: the Strip renders nothing
            at all in both. The Predict the Table tab remains the route back.
          </p>
        </div>
      </div>
      <Switcher current={current} />
    </>
  );
}
