import { NextResponse } from "next/server";
import { hashSecret } from "@/lib/auth/scrypt-secret";
import { validatePinFormat } from "@/lib/auth/signup-validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  adminNotFound,
  isUuid,
  readAdminRequest,
  settlePlayerUpdate,
} from "@/app/api/admin/_lib/admin-request";

interface ResetPinBody {
  playerId?: unknown;
  pin?: unknown;
  pinConfirm?: unknown;
}

// A Competition Admin sets a temporary PIN for a player in their own
// competition and flags the account for a forced reset (docs/admin-ui-spec.md
// §6.2; CLAUDE.md → Identity and auth). Pairs with the player-facing
// forced-reset flow from #36 (POST /api/auth/set-pin, /reset-pin): the flag
// this sets is what makes the player choose a real PIN before reaching the app.
//
// The temporary PIN is communicated in person / by phone — there is no
// delivery mechanism and this route must not add one (docs/adr/0002). The
// route never returns or logs the plaintext PIN; the admin UI echoes it once
// from its own form state.
export async function POST(request: Request) {
  const req = await readAdminRequest<ResetPinBody>(request);
  if (!req.ok) return req.response;
  const { admin, body } = req;

  if (!isUuid(body.playerId)) return adminNotFound();

  const pin = typeof body.pin === "string" ? body.pin : "";
  const pinConfirm =
    typeof body.pinConfirm === "string" ? body.pinConfirm : "";

  // Double-entry is checked server-side, not just in the UI — PIN handling is
  // consequence-critical (TESTING_STANDARD.md §1).
  if (pin !== pinConfirm) {
    return NextResponse.json(
      { error: "The two PINs don't match." },
      { status: 400 },
    );
  }
  if (!validatePinFormat(pin)) {
    return NextResponse.json(
      { error: "PIN must be exactly 4 digits." },
      { status: 400 },
    );
  }

  const supabase = createServerSupabaseClient();

  // One authoritative write, scoped to the admin's own competition (§4
  // rule 3 — no cross-competition write) and to real players (`is_bot =
  // false`; bots have no actions — spec §6.1). No optimistic-concurrency
  // loop: the admin write is "set it now", and a racing failed-login write
  // is last-write-wins (the admin re-taps). Clears lockout state in the same
  // update (CLAUDE.md: "the reset flag then clears, along with any lockout
  // state").
  const result = await supabase
    .from("players")
    .update({
      pin_hash: await hashSecret(pin),
      pin_reset_required: true,
      failed_pin_attempts: 0,
      locked_until: null,
    })
    .eq("id", body.playerId)
    .eq("competition_id", admin.competitionId)
    .eq("is_bot", false)
    .select("id")
    .maybeSingle();

  const settled = settlePlayerUpdate(
    result,
    "Could not update the player's PIN.",
  );
  if (settled) return settled;

  return NextResponse.json({ ok: true });
}
