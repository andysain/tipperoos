"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Route } from "next";
import { LABEL, T, TX, FOCUS } from "@/components/ui/tokens";

export interface StripWeek {
  gameweek: number;
  /** Viewer's points that week. Null when they filed nothing. */
  points: number | null;
  picked: boolean;
  month: string;
  future: boolean;
}

/**
 * The archive, as a control rather than a page
 * (`docs/adr/0013-match-centre-tense-and-axes.md` D14).
 *
 * Deliberately has no step arrows: they cost a quarter of the band's width
 * — showing five of 38 weeks, so the month dividers meant to give it
 * landmarks were mostly out of view — and they fought the strip, because
 * centring the active chip translates the whole row under a stationary
 * finger. Adjacency lives at the bottom of the page instead, where reading
 * ends and the thumb already is.
 */
// Generic over the route it links to: Next's `Route<T>` only satisfies the
// dynamic-route branch when T is the literal template type, so a bare
// `Route` (T = string) is rejected. Keeping it generic also means the picks
// record can reuse this strip against its own route without a cast.
export function GameweekStrip<T extends string>({
  active,
  weeks,
  hrefFor,
}: {
  active: number;
  weeks: readonly StripWeek[];
  hrefFor: (gameweek: number) => Route<T>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-gw="${active}"]`);
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el?.scrollIntoView({
      inline: "center",
      block: "nearest",
      // "auto" on first mount regardless: animating the page sideways on
      // load reads as instability, not as motion design.
      behavior: mounted.current && !reduce ? "smooth" : "auto",
    });
    mounted.current = true;
  }, [active]);

  return (
    <div className="-mx-4 flex flex-col gap-1">
      <div
        ref={ref}
        // The edge fade must clear a whole month label: at 12px it faded
        // "NOV" down to "N", which reads as a rendering bug rather than as
        // content continuing past the edge.
        className="flex snap-proximity gap-1.5 overflow-x-auto scroll-px-4 px-4 py-1 [mask-image:linear-gradient(to_right,transparent_0,black_28px,black_calc(100%-28px),transparent_100%)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {weeks.map((week, i) => {
          const isActive = week.gameweek === active;
          const newMonth = i > 0 && weeks[i - 1].month !== week.month;
          const label = week.future
            ? `Gameweek ${week.gameweek}, not played yet`
            : !week.picked
              ? `Gameweek ${week.gameweek}, you didn't pick`
              : `Gameweek ${week.gameweek}, ${week.points ?? 0} points`;

          const chip = (
            <>
              <span
                className={`${T.label} font-extrabold leading-none tabular-nums`}
                aria-hidden
              >
                {week.gameweek}
              </span>
              {!week.future ? (
                <span
                  className={`mt-0.5 ${T.label} font-medium leading-none tabular-nums ${
                    isActive
                      ? "text-on-ink-muted"
                      : week.picked
                        ? TX.muted
                        : TX.decorative
                  }`}
                  aria-hidden
                >
                  {week.picked ? week.points : "–"}
                </span>
              ) : null}
            </>
          );

          const shape = `flex min-h-11 w-11 shrink-0 snap-center flex-col items-center justify-center rounded-btn-sm border ${FOCUS} ${
            isActive
              ? "border-ink bg-ink text-on-ink"
              : week.future
                ? `border-dashed border-paper-line ${TX.decorative}`
                : `border-paper-line bg-surface text-text`
          }`;

          return (
            <div key={week.gameweek} className="flex items-stretch gap-1.5">
              {newMonth ? (
                <span className="flex shrink-0 flex-col items-center justify-center gap-0.5">
                  <span className="h-6 w-px bg-paper-line" aria-hidden />
                  <span className={`${LABEL} ${TX.muted}`}>{week.month}</span>
                </span>
              ) : null}
              {week.future ? (
                <span
                  data-gw={week.gameweek}
                  className={shape}
                  aria-label={label}
                >
                  {chip}
                </span>
              ) : (
                <Link
                  data-gw={week.gameweek}
                  href={hrefFor(week.gameweek)}
                  aria-current={isActive ? true : undefined}
                  aria-label={label}
                  className={shape}
                >
                  {chip}
                </Link>
              )}
            </div>
          );
        })}
      </div>
      <span className={`px-4 ${LABEL} ${TX.muted}`}>
        Points you scored each week
      </span>
    </div>
  );
}
