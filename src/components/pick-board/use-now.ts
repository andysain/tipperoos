"use client";

import { useEffect, useState } from "react";

/**
 * A clock that starts at the server's render time and then ticks on the
 * player's device, once per minute boundary.
 *
 * The Pick Board's countdown used to be computed once on the server and
 * never move, so a tab left open read "12m" forever. Minute granularity
 * matches formatCountdown, which never shows seconds. Starting from the
 * server's value keeps the first client render identical to the HTML, so
 * hydration doesn't mismatch.
 */
export function useNow(initial: Date): Date {
  const [now, setNow] = useState(initial);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setNow(current);
      // Re-arm on the next minute boundary rather than a fixed 60s
      // interval, so the display never lags a full minute behind.
      timeout = setTimeout(tick, 60_000 - (current.getTime() % 60_000) + 50);
    };
    // First tick on the next task, not synchronously inside the effect.
    timeout = setTimeout(tick, 0);
    // A phone that slept through the lock wakes up to a stale clock; catch
    // up as soon as the tab is visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timeout);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return now;
}
