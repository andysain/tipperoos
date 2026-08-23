import { useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { type BandKey } from "@/lib/table-predictions/rules";
import { ConfettiBurst, TeamIdentity, type Team } from "./shared";
import { T, TX } from "@/components/ui/tokens";

// Stays on screen until the player explicitly dismisses it -- no
// auto-timeout. This is a "you're locked in" confirmation, not a passive
// toast; a player who glances away shouldn't come back to it already gone.
export function SubmittedMoment({
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="submitted-moment-title"
      onKeyDown={(event) => {
        if (event.key === "Tab") {
          event.preventDefault();
          dismissButtonRef.current?.focus();
        }
      }}
      className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-1 overflow-auto bg-paper/95 p-4 text-center backdrop-blur-sm"
    >
      <ConfettiBurst position="absolute" />

      <div
        className={`flex flex-col items-center transition motion-reduce:transition-none motion-safe:duration-500 ${
          shown ? "scale-100 opacity-100" : "scale-75 opacity-0"
        }`}
      >
        <Trophy className="mx-auto size-12 text-accent" aria-hidden />
        <p
          id="submitted-moment-title"
          className={`mt-2 ${T.h2} font-extrabold ${TX.base}`}
        >
          You&apos;re locked in!
        </p>
        <p className={`mt-1 max-w-[26ch] ${T.dense} ${TX.muted}`}>
          Submitted -- you can keep editing until 31 August.
        </p>
        {champion ? (
          <div className={`mt-3 inline-flex items-center gap-2 rounded-btn bg-accent/10 px-3 py-2 ${T.dense} font-bold ${TX.base}`}>
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
