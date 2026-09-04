import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import { hashSecret } from "@/lib/auth/scrypt-secret";
import { validatePinFormat } from "@/lib/auth/signup-validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface SetPinBody {
  pin?: unknown;
}

// The player-facing half of the admin-assisted forced-reset flow (issue #36,
// CLAUDE.md -> Identity and auth). An admin sets a temporary PIN and flags
// the row (issue #201); the player logs in with it, is redirected here by
// loadActivePlayer() (src/app/_lib/session-player.ts), and picks a real PIN
// before reaching the app.
//
// This is ONLY the forced-reset route -- it requires the caller's own row to
// carry pin_reset_required. It is not a general "change my PIN" feature
// (none is in scope: CLAUDE.md, docs/admin-ui-spec.md §6.2).
//
// CSRF-first, like /api/auth/login and /api/auth/signup. The admin routes
// (#201) invert this to gate-before-CSRF so a probe gets a bodyless 404
// instead of a 403 (spec §4 rule 2) -- there's no hidden-surface concern
// here, so the login/signup ordering is the one to match.
export async function POST(request: Request) {
  if (!hasCsrfHeader(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const playerId = await getSessionPlayerId();
  if (!playerId) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  let body: SetPinBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  // Coerce exactly as the login route does (login/route.ts) so a missing or
  // non-string pin is a clean 400, not a thrown validator.
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!validatePinFormat(pin)) {
    return NextResponse.json(
      { error: "PIN must be exactly 4 digits." },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseClient();

  const { data: player, error: lookupError } = await supabase
    .from("players")
    .select("id, pin_reset_required")
    .eq("id", playerId)
    // .order()/.limit(1) on a single-row select per AGENTS.md.
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json(
      { error: "Could not look up your account." },
      { status: 500 },
    );
  }
  if (!player) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }
  if (player.pin_reset_required !== true) {
    // Authenticated, but no reset is pending -- this route does nothing else.
    return NextResponse.json(
      { error: "No PIN reset is pending for this account." },
      { status: 403 },
    );
  }

  const pinHash = await hashSecret(pin);

  // One authoritative write by the session owner -- not a brute-force path,
  // so no optimistic-concurrency loop (cf. the login route's lockout CAS).
  // Clears the reset flag AND any lockout state in the same update
  // (CLAUDE.md -> Identity and auth: "the reset flag then clears, along with
  // any lockout state").
  //
  // The `.eq("pin_reset_required", true)` predicate is the atomic guard: it
  // closes the check-then-act window between the SELECT above and this write
  // (a concurrent reset, or a double-submit, clearing the flag in between),
  // so "this route only ever acts on a pending reset" holds by construction.
  const { data: updated, error: updateError } = await supabase
    .from("players")
    .update({
      pin_hash: pinHash,
      pin_reset_required: false,
      failed_pin_attempts: 0,
      locked_until: null,
    })
    .eq("id", playerId)
    .eq("pin_reset_required", true)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: "Could not update your PIN." },
      { status: 500 },
    );
  }
  if (!updated) {
    // The flag was cleared between the SELECT and this write -- another
    // request (or an earlier submit of this one) already completed the
    // reset. Nothing broke; the player just needs to sign in with the PIN
    // that write set.
    return NextResponse.json(
      { error: "This reset was already completed — sign in with your new PIN." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
