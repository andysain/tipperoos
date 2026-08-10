"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  detectBrowserTimeZone,
  readCookieValue,
  TIMEZONE_COOKIE_NAME,
} from "./timezone-cookie";

// A preference, not a session -- long-lived, no expiry logic needed (see
// CLAUDE.md's session cookie, which is the opposite: no max-age at all,
// cleared explicitly by "Switch player").
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Keeps the `tz` cookie in sync with the browser's detected timezone, so
 * server-rendered datetimes (src/app/page.tsx) resolve to the viewer's real
 * timezone instead of the Australia/Sydney fallback -- see issue #93.
 * Reads document.cookie directly rather than depending on a server-passed
 * "current SSR value" prop, since nothing hands one down; this keeps the
 * component self-contained and lets it mount anywhere without changing
 * layout.tsx into a cookie-reading Server Component.
 * Renders nothing. Only writes the cookie and refreshes on a genuine
 * mismatch -- first-ever visit, or the browser's timezone actually
 * changing -- not on every mount.
 */
export function TimezoneSync() {
  const router = useRouter();

  useEffect(() => {
    const detected = detectBrowserTimeZone();
    const current = readCookieValue(document.cookie, TIMEZONE_COOKIE_NAME);
    if (current === detected) return;

    document.cookie = `${TIMEZONE_COOKIE_NAME}=${encodeURIComponent(detected)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    router.refresh();
  }, [router]);

  return null;
}
