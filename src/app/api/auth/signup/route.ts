import { NextResponse } from "next/server";
import { hasCsrfHeader } from "@/app/_lib/csrf";
import { setSessionCookie } from "@/app/_lib/session-cookie";
import { resolveCompetitionByCode } from "@/lib/auth/competitions";
import { hashSecret } from "@/lib/auth/scrypt-secret";
import {
  validateDisplayName,
  validatePinFormat,
} from "@/lib/auth/signup-validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface SignupBody {
  competitionCode?: unknown;
  displayName?: unknown;
  pin?: unknown;
  email?: unknown;
  emoji?: unknown;
}

export async function POST(request: Request) {
  if (!hasCsrfHeader(request)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: SignupBody;
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
  const displayNameInput =
    typeof body.displayName === "string" ? body.displayName : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";

  const supabase = createServerSupabaseClient();
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

  const displayNameResult = validateDisplayName(displayNameInput);
  if (!displayNameResult.ok) {
    return NextResponse.json(
      { error: displayNameResult.reason },
      { status: 400 },
    );
  }

  if (!validatePinFormat(pin)) {
    return NextResponse.json(
      { error: "PIN must be exactly 4 digits." },
      { status: 400 },
    );
  }

  const { data: existing, error: lookupError } = await supabase
    .from("players")
    .select("id")
    .eq("competition_id", competitionId)
    .ilike("display_name", displayNameResult.normalized)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json(
      { error: "Could not check display name availability." },
      { status: 500 },
    );
  }
  if (existing) {
    return NextResponse.json(
      { error: "That display name is already taken." },
      { status: 409 },
    );
  }

  const pinHash = await hashSecret(pin);

  const { data: player, error: insertError } = await supabase
    .from("players")
    .insert({
      competition_id: competitionId,
      display_name: displayNameResult.normalized,
      pin_hash: pinHash,
      email: email || null,
      emoji: emoji || null,
    })
    .select("id, display_name, emoji")
    .single();

  if (insertError || !player) {
    // A unique-index violation here means a race with another signup for
    // the same display name between the lookup above and this insert.
    const status = insertError?.code === "23505" ? 409 : 500;
    const message =
      status === 409
        ? "That display name is already taken."
        : "Could not create player.";
    return NextResponse.json({ error: message }, { status });
  }

  await setSessionCookie(player.id);

  return NextResponse.json(
    {
      id: player.id,
      displayName: player.display_name,
      emoji: player.emoji,
    },
    { status: 201 },
  );
}
