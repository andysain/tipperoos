import { T, TX } from "./tokens";

/**
 * A points value, wherever one is rendered.
 *
 * Tone breaks on the only two boundaries this scoring model has
 * (`docs/adr/0012-leaderboard-view.md` D10): **7 is an exact score**, **>= 3
 * is the result right**. An earlier five-step ramp invented steps at 4 and 5
 * that mean nothing and ran them through `info` -- the token the palette
 * defines as never implying good or bad, on screens where it also means
 * "this is a bot".
 *
 * `+` means points gained and nothing else, so zero renders `0` (never
 * `+0` -- a non-event dressed as a gain) and an absent value renders blank
 * rather than a dash, because the dash is already carrying four other
 * meanings elsewhere.
 */
export function pointTone(points: number | null): string {
  if (points === null) return TX.decorative;
  if (points === 7) return "text-success font-extrabold";
  if (points >= 3) return TX.base;
  return TX.muted;
}

export function pointLabel(points: number | null): string {
  if (points === null) return "";
  return points > 0 ? `+${points}` : "0";
}

export function Points({
  points,
  className = "",
}: {
  points: number | null;
  className?: string;
}) {
  if (points === null) {
    return <span className={className} aria-hidden />;
  }
  // An exact score is the only filled chip in the app's point rendering, so
  // a season's handful of them pop out of a long scroll.
  if (points === 7) {
    return (
      <span
        className={`rounded-badge bg-success px-1.5 py-0.5 ${T.caption} font-extrabold tabular-nums text-on-ink ${className}`}
      >
        <span className="sr-only">Exact score, </span>7
        <span className="sr-only"> points</span>
      </span>
    );
  }
  return (
    <span
      className={`${T.caption} tabular-nums ${pointTone(points)} ${className}`}
    >
      <span className="sr-only">{points} points</span>
      <span aria-hidden>{pointLabel(points)}</span>
    </span>
  );
}
