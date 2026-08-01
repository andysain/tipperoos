import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { clearSessionCookie } from "@/app/_lib/session-cookie";

// Backs the "Switch player" flow (CLAUDE.md -> Identity and auth) -- a
// shared-device trust mitigation, not a security-critical revocation (the
// session cookie has no server-side record to revoke; this just clears it
// client-side).
export async function POST(request: Request) {
  if (!hasCsrfHeader(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
