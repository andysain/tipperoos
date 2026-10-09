"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CARD_SHADOW, LABEL, MICRO_LABEL, T, TX } from "@/components/ui/tokens";

// The /admin index's Gameweek wrap (#219, design pass 2026-10-09). The
// message block IS the copied text, line for line, so there's nothing to
// reconcile -- and it doubles as the fallback when the clipboard refuses:
// the block's text is selected for the phone's own Copy. No motion.
//
// Receives strings only (#219 L7): never the wrap object or any pick.

const CARD = `flex flex-col gap-3 rounded-card border border-paper-line bg-white p-4 ${CARD_SHADOW}`;

/** How long "Copied ✓" holds before the label returns. */
const COPIED_MS = 2000;

export type WrapPanelProps =
  | { state: "none" }
  | { state: "error" }
  | {
      state: "ready";
      gameweekNumber: number;
      text: string;
      awardCount: number;
      noPicks: string[];
    };

export function WrapPanel(props: WrapPanelProps) {
  if (props.state !== "ready") {
    return (
      <section className={CARD} aria-labelledby="admin-wrap-heading">
        <h2 id="admin-wrap-heading" className={`${LABEL} ${TX.muted}`}>
          Gameweek wrap
        </h2>
        <p className={`${T.dense} ${TX.muted}`}>
          {props.state === "none"
            ? "The first wrap appears once Gameweek 1 is scored."
            : "Couldn't load the wrap. Reload to try again."}
        </p>
      </section>
    );
  }
  return <ReadyWrap {...props} />;
}

function ReadyWrap({
  gameweekNumber,
  text,
  awardCount,
  noPicks,
}: Extract<WrapPanelProps, { state: "ready" }>) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const blockRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    if (timer.current !== null) clearTimeout(timer.current);
    try {
      // Missing on an insecure origin and in some in-app browsers.
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      timer.current = setTimeout(() => setStatus("idle"), COPIED_MS);
    } catch {
      const block = blockRef.current;
      if (block !== null) window.getSelection()?.selectAllChildren(block);
      setStatus("failed");
    }
  };

  const hasAwards = awardCount > 0;

  return (
    <section className={CARD} aria-labelledby="admin-wrap-heading">
      <div className="flex items-baseline gap-2">
        <h2 id="admin-wrap-heading" className={`${LABEL} ${TX.muted}`}>
          Gameweek {gameweekNumber} wrap
        </h2>
        <span className={`ml-auto ${T.caption} tabular-nums ${TX.muted}`}>
          {awardCount} {awardCount === 1 ? "award" : "awards"}
        </span>
      </div>

      {hasAwards ? (
        <div
          ref={blockRef}
          // The exact clipboard text: pre-wrap keeps its line breaks and
          // wraps long lines rather than scrolling sideways at 375px.
          className={`whitespace-pre-wrap break-words rounded-btn border border-paper-line bg-paper px-4 py-3 leading-relaxed ${T.dense} ${TX.base} selection:bg-accent/40`}
        >
          {text}
        </div>
      ) : (
        <p className={`${T.dense} ${TX.muted}`}>No awards this week.</p>
      )}

      <Button intent="secondary" fullWidth disabled={!hasAwards} onClick={copy}>
        {status === "copied" ? "Copied ✓" : "Copy as text"}
      </Button>
      {/* Always mounted so screen readers announce changes; visually
          hidden except for the fallback's instruction. */}
      <p
        role="status"
        className={status === "failed" ? `${T.caption} ${TX.muted}` : "sr-only"}
      >
        {status === "copied"
          ? "Wrap copied"
          : status === "failed"
            ? "Copy didn't work here. The text is selected, so use your phone's Copy."
            : ""}
      </p>

      <div className="flex flex-col gap-1 border-t border-paper-line pt-3">
        <p className={`${MICRO_LABEL} ${TX.muted}`}>Only you see this</p>
        <p className={`${T.dense} ${TX.base}`}>
          {noPicks.length > 0 ? (
            <>
              <span className="font-bold">
                No picks in Gameweek {gameweekNumber}
              </span>{" "}
              · {noPicks.join(", ")}
            </>
          ) : (
            "Everyone filed every pick"
          )}
        </p>
      </div>
    </section>
  );
}
