import { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { tv } from "tailwind-variants";
import { Button } from "@/components/ui/Button";
import { type BandKey } from "@/lib/table-predictions/rules";
import { TeamIdentity, type Team } from "./shared";

type BandTone = "success" | "info" | "warning" | "danger" | "neutral";

// A handful of falling confetti pieces, reusing the existing semantic
// tones (never a new color -- DESIGN_SYSTEM.md's "no other colors" rule).
// Purely decorative: aria-hidden, and skipped outright under
// prefers-reduced-motion rather than just not animating.
const CONFETTI: { left: number; delay: number; tone: BandTone }[] = [
  { left: 8, delay: 0, tone: "success" },
  { left: 20, delay: 0.08, tone: "warning" },
  { left: 33, delay: 0.02, tone: "info" },
  { left: 46, delay: 0.14, tone: "danger" },
  { left: 58, delay: 0.05, tone: "success" },
  { left: 70, delay: 0.11, tone: "info" },
  { left: 82, delay: 0.03, tone: "warning" },
  { left: 92, delay: 0.09, tone: "danger" },
];

const confettiPiece = tv({
  base: "absolute top-0 h-2 w-2 rounded-sm motion-safe:animate-confetti-fall",
  variants: {
    tone: {
      success: "bg-success",
      info: "bg-info",
      warning: "bg-warning",
      danger: "bg-danger",
      neutral: "bg-ink/30",
    },
  },
});

// Stays on screen until the player explicitly dismisses it -- no
// auto-timeout. This is a "you're locked in" confirmation, not a passive
// toast; a player who glances away shouldn't come back to it already gone.
export function SealedMoment({
  assignments,
  teamsById,
  onDismiss,
}: {
  assignments: Record<string, BandKey>;
  teamsById: Map<string, Team>;
  onDismiss: () => void;
}) {
  const [shown, setShown] = useState(false);
  const dismissButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    // Moves focus onto the dismiss button so screen readers announce the
    // celebration text as soon as it appears, since it's inserted
    // dynamically rather than being part of the initial page load.
    dismissButtonRef.current?.focus();
    return () => cancelAnimationFrame(id);
  }, []);

  const championId = Object.entries(assignments).find(
    ([, band]) => band === "champion",
  )?.[0];
  const champion = championId ? teamsById.get(championId) : undefined;

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 overflow-hidden rounded-card bg-paper/95 text-center backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 motion-reduce:hidden">
        {CONFETTI.map((piece, i) => (
          <span
            key={i}
            aria-hidden
            className={confettiPiece({ tone: piece.tone })}
            style={{
              left: `${piece.left}%`,
              animationDelay: `${piece.delay}s`,
            }}
          />
        ))}
      </div>

      <div
        className={`flex flex-col items-center transition motion-reduce:transition-none motion-safe:duration-500 ${
          shown ? "scale-100 opacity-100" : "scale-75 opacity-0"
        }`}
      >
        <Trophy className="mx-auto size-12 text-accent" aria-hidden />
        <p className="mt-2 text-xl font-extrabold text-ink">
          You&apos;re locked in!
        </p>
        <p className="mt-1 max-w-[26ch] text-sm text-ink/70">
          Submitted -- you can keep editing until Gameweek 1 kicks off.
        </p>
        {champion ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-btn bg-accent/10 px-3 py-2 text-sm font-bold text-ink">
            <Trophy className="size-4 shrink-0 text-accent" aria-hidden />
            <TeamIdentity team={champion} /> to win it all
          </div>
        ) : null}
        <Button
          ref={dismissButtonRef}
          type="button"
          onClick={onDismiss}
          className="mt-5 max-w-[10rem]"
        >
          Got it
        </Button>
      </div>
    </div>
  );
}
