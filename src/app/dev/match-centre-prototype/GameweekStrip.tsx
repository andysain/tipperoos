"use client";

// The archive as a control. Fixed in review:
//   * the two arrows ate 88px of a 358px band -- showing 5 of 38 weeks, so
//     the month dividers introduced to give it landmarks were mostly out of
//     view -- and they FOUGHT the strip: the auto-centre scrollIntoView
//     translates the whole strip under a stationary finger, moving the next
//     target before the animation ends. Adjacency now lives at the bottom of
//     the page, where reading ends and the thumb already is.
//   * the month label was faded, not clipped, by the edge mask -- "NOV"
//     rendered as "N". The mask now clears any label, and the marker can't
//     shrink.
//   * a week you didn't pick and a week you scored nothing rendered the
//     same.
//   * the caption didn't say what the numbers were.

import { useEffect, useRef } from "react";
import { STRIP } from "./season";
import { FOCUS, LABEL, TEXT, TEXT_MUTED, TEXT_FAINT, T_LABEL } from "./shared";

export function GameweekStrip({
  active,
  onSelect,
}: {
  active: number;
  onSelect: (gw: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-gw="${active}"]`);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: mounted.current && !reduce ? "smooth" : "auto",
    });
    mounted.current = true;
  }, [active]);

  return (
    <div className="-mx-4 flex flex-col gap-1">
      <div
        ref={ref}
        className="flex snap-proximity gap-1.5 overflow-x-auto scroll-px-4 px-4 py-1 [mask-image:linear-gradient(to_right,transparent_0,black_28px,black_calc(100%-28px),transparent_100%)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {STRIP.map((week, i) => {
          const isActive = week.gameweek === active;
          const newMonth = i > 0 && STRIP[i - 1].month !== week.month;
          return (
            <div key={week.gameweek} className="flex items-stretch gap-1.5">
              {newMonth ? (
                <span className="flex shrink-0 flex-col items-center justify-center gap-0.5">
                  <span className="h-6 w-px bg-paper-line" aria-hidden />
                  <span className={`${LABEL} ${TEXT_FAINT}`}>{week.month}</span>
                </span>
              ) : null}
              <button
                data-gw={week.gameweek}
                onClick={() => !week.future && onSelect(week.gameweek)}
                disabled={week.future}
                aria-current={isActive ? "true" : undefined}
                aria-label={
                  week.future
                    ? `Gameweek ${week.gameweek}, not played yet`
                    : !week.picked
                      ? `Gameweek ${week.gameweek}, you didn't pick`
                      : `Gameweek ${week.gameweek}, ${week.points ?? 0} points`
                }
                className={`flex min-h-11 w-11 shrink-0 snap-center flex-col items-center justify-center rounded-btn-sm border ${FOCUS} ${
                  isActive
                    ? `border-ink bg-ink text-paper`
                    : week.future
                      ? `border-dashed border-paper-line bg-transparent ${TEXT_FAINT}`
                      : `border-paper-line bg-white ${TEXT}`
                }`}
              >
                <span
                  className={`${T_LABEL} font-extrabold leading-none tabular-nums`}
                  aria-hidden
                >
                  {week.gameweek}
                </span>
                {!week.future ? (
                  <span
                    className={`mt-0.5 ${T_LABEL} font-medium leading-none tabular-nums ${
                      isActive
                        ? "text-paper/70"
                        : week.picked
                          ? TEXT_MUTED
                          : TEXT_FAINT
                    }`}
                    aria-hidden
                  >
                    {!week.picked ? "–" : week.points}
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
      <span className={`px-4 ${LABEL} ${TEXT_FAINT}`}>
        Points you scored each week · – means you didn&apos;t pick
      </span>
    </div>
  );
}
