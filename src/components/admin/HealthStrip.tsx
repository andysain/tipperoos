import Link from "next/link";
import type { AdminHealth, HealthSignal } from "@/app/_lib/admin-health-access";
import type { HealthState } from "@/lib/admin/health-signals";
import { CARD_SHADOW, FOCUS, LABEL, T, TX } from "@/components/ui/tokens";

// The /admin index's "is anything wrong?" strip (docs/admin-ui-spec.md §5).
// Server component -- nothing here ticks; the state is whatever the request
// resolved. One row per signal, per §5.
//
// green/amber/red is carried by BOTH a coloured dot and a state word ("OK"
// / "Check" / "Action needed"), never colour alone -- `warning` in
// particular is a pale yellow that can't be the only signal
// (docs/DESIGN_SYSTEM.md's contrast rules). The tokens map straight onto
// the design system's semantic colours: success / warning / danger, used
// as text colour, which those tokens are cleared for on a light ground.

const STATE_META: Record<HealthState, { word: string; dot: string }> = {
  green: { word: "OK", dot: "text-success" },
  amber: { word: "Check", dot: "text-warning" },
  red: { word: "Action needed", dot: "text-danger" },
};

function SignalBody({ signal }: { signal: HealthSignal }) {
  const meta = STATE_META[signal.state];
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span
          className={`${meta.dot} ${T.label} leading-none`}
          aria-hidden="true"
        >
          ●
        </span>
        <span className={`${T.dense} font-bold ${TX.base}`}>
          {signal.label}
        </span>
        <span className={`${LABEL} ${TX.muted}`}>{meta.word}</span>
      </div>
      <p className={`${T.caption} ${TX.muted} pl-5`}>{signal.detail}</p>
    </div>
  );
}

function SignalRow({ signal }: { signal: HealthSignal }) {
  if (signal.href) {
    return (
      <Link href={signal.href} className={`block rounded-btn-sm ${FOCUS}`}>
        <SignalBody signal={signal} />
      </Link>
    );
  }
  return <SignalBody signal={signal} />;
}

export function HealthStrip({ health }: { health: AdminHealth }) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-card border border-paper-line bg-white p-4 ${CARD_SHADOW}`}
      aria-label="Competition health"
    >
      <p className={`${LABEL} ${TX.muted}`}>Health</p>
      <ul className="flex flex-col gap-3">
        {health.signals.map((signal) => (
          <li key={signal.key}>
            <SignalRow signal={signal} />
          </li>
        ))}
      </ul>
    </section>
  );
}
