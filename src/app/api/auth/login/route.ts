import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { setSessionCookie } from "@/app/_lib/session-cookie";
import { resolveCompetitionByCode } from "@/lib/auth/competitions";
import {
  MAX_FAILED_PIN_ATTEMPTS,
  isLocked,
  recordFailedPinAttempt,
  recordSuccessfulLogin,
  type LockoutState,
} from "@/lib/auth/lockout";
import { verifySecret } from "@/lib/auth/scrypt-secret";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface LoginBody {
  competitionCode?: unknown;
  displayName?: unknown;
  pin?: unknown;
}

export async function POST(request: Request) {
  if (!hasCsrfHeader(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const competitionCode =
    typeof body.competitionCode === "string" ? body.competitionCode : "";
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const pin = typeof body.pin === "string" ? body.pin : "";

  if (!displayName || !pin) {
    return NextResponse.json(
      { error: "Display name and PIN are required." },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseClient();

  // Client sends the code it already holds; the server re-derives
  // competitionId itself -- never trust a client-asserted competitionId
  // directly (see docs/adr/0004-multi-competition-foundational-scope.md
  // decision 3, the login-ambiguity fix).
  const competitionId = await resolveCompetitionByCode(
    supabase,
    competitionCode,
  );
  if (!competitionId) {
    return NextResponse.json(
      { error: "Invalid competition code." },
      { status: 403 },
    );
  }

  const { data: player, error: lookupError } = await supabase
    .from("players")
    .select(
      "id, display_name, emoji, pin_hash, failed_pin_attempts, locked_until, pin_reset_required",
    )
    .eq("competition_id", competitionId)
    .ilike("display_name", displayName)
    .maybeSingle();

  const invalidCredentials = () =>
    NextResponse.json(
      { error: "Incorrect display name or PIN." },
      { status: 401 },
    );

  if (lookupError) {
    return NextResponse.json(
      { error: "Could not look up player." },
      { status: 500 },
    );
  }
  if (!player) {
    return invalidCredentials();
  }

  const now = new Date();
  const lockoutState: LockoutState = {
    failedPinAttempts: player.failed_pin_attempts,
    lockedUntil: player.locked_until,
  };

  if (isLocked(lockoutState, now)) {
    return NextResponse.json(
      {
        error: "Too many incorrect PIN attempts. Try again later.",
        lockedUntil: lockoutState.lockedUntil,
      },
      { status: 423 },
    );
  }

  const pinIsCorrect = await verifySecret(pin, player.pin_hash);

  if (!pinIsCorrect) {
    const nextState = recordFailedPinAttempt(lockoutState, now);
    await supabase
      .from("players")
      .update({
        failed_pin_attempts: nextState.failedPinAttempts,
        locked_until: nextState.lockedUntil,
      })
      .eq("id", player.id);

    const attemptsRemaining = Math.max(
      0,
      MAX_FAILED_PIN_ATTEMPTS - nextState.failedPinAttempts,
    );
    return NextResponse.json(
      { error: "Incorrect display name or PIN.", attemptsRemaining },
      { status: 401 },
    );
  }

  const resetState = recordSuccessfulLogin(lockoutState);
  await supabase
    .from("players")
    .update({
      failed_pin_attempts: resetState.failedPinAttempts,
      locked_until: resetState.lockedUntil,
    })
    .eq("id", player.id);

  await setSessionCookie(player.id);

  return NextResponse.json({
    id: player.id,
    displayName: player.display_name,
    emoji: player.emoji,
    pinResetRequired: player.pin_reset_required,
  });
}
