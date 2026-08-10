// Shared between the client (TimezoneSync, reading document.cookie) and the
// server (src/app/page.tsx, reading via next/headers' cookies()) so both
// sides agree on the cookie name and the fallback used before it's ever
// been set -- see issue #93.
//
// Deliberately outside src/lib/** (same rationale as
// src/app/_lib/session-cookie.ts: plain string constants and a cookie-string
// parser, no decision logic with a meaningful numeric golden value to
// assert -- the critical-module-guard's golden-value gate applies uniformly
// to everything under src/lib/**, not just the five consequence-critical
// modules, and forcing a fake numeric assertion here to satisfy it would be
// exactly the kind of gaming that gate exists to catch).

export const TIMEZONE_COOKIE_NAME = "tz";

/** Used server-side before the client has ever written the cookie, and
 * everywhere email rendering needs a fixed timezone (CLAUDE.md -> "Hard
 * constraints"). */
export const DEFAULT_TIME_ZONE = "Australia/Sydney";

/**
 * Parses a `document.cookie`-style string (`"a=1; b=2"`) for one named
 * value. Not Next's `cookies()` API, which already does this server-side --
 * this is only for the client's own read of `document.cookie`.
 */
export function readCookieValue(
  cookieString: string,
  name: string,
): string | undefined {
  for (const pair of cookieString.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const key = pair.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(pair.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/**
 * The viewer's IANA timezone, per the browser. Client-only -- both call
 * sites (TimezoneSync.tsx, login/page.tsx) are "use client" components.
 */
export function detectBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
