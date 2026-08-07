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
    .ilike("display_name", displayName.replace(/[%_]/g, "\\$&"))
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

  const pinIsCorrect = await verifySecret(pin, player.pin_hash);

  // Concurrent wrong-PIN guesses must not all read-then-write the same
  // stale counter (that would defeat the 5-attempt lockout). Each retry
  // re-reads the current row and applies its conditional update only if
  // no other request has changed it since -- an optimistic-concurrency
  // loop instead of a blind read-then-write.
  let currentState: LockoutState = {
    failedPinAttempts: player.failed_pin_attempts,
    lockedUntil: player.locked_until,
  };
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const now = new Date();

    if (isLocked(currentState, now)) {
      return NextResponse.json(
        {
          error: "Too many incorrect PIN attempts. Try again later.",
          lockedUntil: currentState.lockedUntil,
        },
        { status: 423 },
      );
    }

    const nextState = pinIsCorrect
      ? recordSuccessfulLogin(currentState)
      : recordFailedPinAttempt(currentState, now);

    const { data: updated, error: updateError } = await supabase
      .from("players")
      .update({
        failed_pin_attempts: nextState.failedPinAttempts,
        locked_until: nextState.lockedUntil,
      })
      .eq("id", player.id)
      .eq("failed_pin_attempts", currentState.failedPinAttempts)
      .select("failed_pin_attempts, locked_until")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { error: "Could not update login state." },
        { status: 500 },
      );
    }

    if (!updated) {
      // Another concurrent request updated the row first -- re-read and retry.
      const { data: refreshed, error: refetchError } = await supabase
        .from("players")
        .select("failed_pin_attempts, locked_until")
        .eq("id", player.id)
        .single();
      if (refetchError) {
        return NextResponse.json(
          { error: "Could not update login state." },
          { status: 500 },
        );
      }
      currentState = {
        failedPinAttempts: refreshed.failed_pin_attempts,
        lockedUntil: refreshed.locked_until,
      };
      continue;
    }

    if (!pinIsCorrect) {
      const attemptsRemaining = Math.max(
        0,
        MAX_FAILED_PIN_ATTEMPTS - nextState.failedPinAttempts,
      );
      return NextResponse.json(
        { error: "Incorrect display name or PIN.", attemptsRemaining },
        { status: 401 },
      );
    }

    await setSessionCookie(player.id);

    return NextResponse.json({
      id: player.id,
      displayName: player.display_name,
      emoji: player.emoji,
      pinResetRequired: player.pin_reset_required,
    });
  }

  return NextResponse.json(
    { error: "Too many concurrent login attempts. Please try again." },
    { status: 429 },
  );
}
