import { CONFETTI, confettiPiece } from "./shared";

// The champion ceremony (issue #118): the moment a champion is named, a
// purely decorative confetti beat falls from the top of the viewport.
// Deliberately nothing like SubmittedMoment -- no dialog, no focus change,
// nothing to dismiss, no role: players change their champion, and a
// celebration that punishes reconsidering is worse than none (ADR 0008).
// The wrapper is pointer-events-none and aria-hidden, so input and screen
// readers are untouched; PredictTableFlow unmounts it after
// CHAMPION_CELEBRATION_MS.
export function ChampionCelebration() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-20 motion-reduce:hidden"
    >
      {CONFETTI.map((piece, index) => (
        <span
          key={index}
          className={confettiPiece({ tone: piece.tone })}
          style={{
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
