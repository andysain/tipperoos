import "server-only";
import { cookies } from "next/headers";
import { signSession, verifySession } from "@/lib/auth/session";

// Framework glue around next/headers' cookie store -- deliberately outside
// src/lib/** (see TESTING_STANDARD.md's golden-value discipline, which
// applies uniformly to everything under src/lib/**, not just the five
// consequence-critical modules). There's no meaningful golden value to
// assert here; the actual signing/verification logic it wraps already has
// its own golden-value tests in src/lib/auth/session.test.ts.

const COOKIE_NAME = "tipperoos_session";

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing SESSION_SECRET environment variable.");
  }
  return secret;
}

/** Issues the signed session cookie for a player. No expiry (see CLAUDE.md). */
export async function setSessionCookie(playerId: string): Promise<void> {
  const token = signSession(playerId, getSessionSecret());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

/** Clears the session cookie -- backs the "Switch player" flow. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Returns the authenticated player id, or null if there's no valid session. */
export async function getSessionPlayerId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token, getSessionSecret());
}
