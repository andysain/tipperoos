import Link from "next/link";
import type { AdminHealth, HealthSignal } from "@/app/_lib/admin-health-access";
import type { HealthState } from "@/lib/admin/health-signals";
import {
  CARD_SHADOW,
  FOCUS,
  LABEL,
  MICRO_LABEL,
  T,
  TX,
} from "@/components/ui/tokens";

// The /admin index's "is anything wrong?" strip (docs/admin-ui-spec.md §5).
// Server component -- nothing here ticks.
//
// Severity has to be visible at a glance, so the states are NOT rendered at
// equal weight: a red row's label goes danger-coloured and bold, an amber
// row keeps ink but gets an amber dot, a green row recedes (faint "OK",
// muted label). The one-line count next to the "Health" heading answers
// §5's actual brief -- "is anything wrong?" -- before the reader scans the
// rows. Tokens map onto the design system's semantic colours (success /
// warning / danger), used as text colour, which they're cleared for on a
// light ground.

const STATE_META: Record<
  HealthState,
  { word: string; dot: string; label: string; wordCls: string }
> = {
  green: {
    word: "OK",
    dot: "text-success",
    label: `${T.dense} font-bold ${TX.muted}`,
    wordCls: `${MICRO_LABEL} ${TX.decorative}`,
  },
  amber: {
    word: "Check",
    dot: "text-warning",
    label: `${T.dense} font-bold ${TX.base}`,
    wordCls: `${MICRO_LABEL} ${TX.muted}`,
  },
  red: {
    word: "Action needed",
    dot: "text-danger",
    label: `${T.dense} font-extrabold text-danger`,
    wordCls: `${MICRO_LABEL} text-danger`,
  },
};

function summaryLine(signals: HealthSignal[]): {
  text: string;
  cls: string;
} {
  const red = signals.filter((s) => s.state === "red").length;
  const amber = signals.filter((s) => s.state === "amber").length;
  if (red > 0) {
    return {
      text: `${red} need${red === 1 ? "s" : ""} action`,
      cls: `${MICRO_LABEL} text-danger`,
    };
  }
  if (amber > 0) {
    return { text: `${amber} to check`, cls: `${MICRO_LABEL} ${TX.muted}` };
  }
  return { text: "All clear", cls: `${MICRO_LABEL} text-success` };
}

function SignalBody({ signal }: { signal: HealthSignal }) {
  const meta = STATE_META[signal.state];
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span
          className={`${meta.dot} ${T.dense} leading-none`}
          aria-hidden="true"
        >
          ●
        </span>
        <span className={meta.label}>{signal.label}</span>
        <span className={meta.wordCls}>{meta.word}</span>
      </div>
      <p className={`${T.caption} ${TX.muted} pl-5`}>{signal.detail}</p>
      {signal.guidance ? (
        <p className={`${T.caption} ${TX.decorative} pl-5`}>
          {signal.guidance}
        </p>
      ) : null}
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
  const summary = summaryLine(health.signals);
  return (
    <section
      className={`flex flex-col gap-3 rounded-card border border-paper-line bg-white p-4 ${CARD_SHADOW}`}
      aria-label="Competition health"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className={`${LABEL} ${TX.muted}`}>Health</p>
        <p className={summary.cls}>{summary.text}</p>
      </div>
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
