import { ConfettiBurst } from "./shared";

// The champion ceremony (issue #118): the moment a champion is named, a
// purely decorative confetti beat falls over the viewport. Deliberately
// nothing like SubmittedMoment -- no dialog, no focus change, nothing to
// dismiss, no role: players change their champion, and a celebration that
// punishes reconsidering is worse than none (ADR 0008). ConfettiBurst is
// pointer-events-none and aria-hidden, so input and screen readers are
// untouched; PredictTableFlow unmounts it after CHAMPION_CELEBRATION_MS.
export function ChampionCelebration() {
  return <ConfettiBurst position="fixed" />;
}
