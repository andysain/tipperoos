import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  adminNotFound,
  isUuid,
  readAdminRequest,
  settlePlayerUpdate,
} from "@/app/api/admin/_lib/admin-request";

interface ClearLockoutBody {
  playerId?: unknown;
}

// A Competition Admin clears a player's lockout without touching their PIN
// (docs/admin-ui-spec.md §6.2). This is the common case — a kid mistyped
// five times — so the UI does it in one tap, no confirm dialog.
export async function POST(request: Request) {
  const req = await readAdminRequest<ClearLockoutBody>(request);
  if (!req.ok) return req.response;
  const { admin, body } = req;

  if (!isUuid(body.playerId)) return adminNotFound();

  const supabase = createServerSupabaseClient();

  // Idempotent: resets exactly the fields recordSuccessfulLogin() returns and
  // isLocked() reads (src/lib/auth/lockout.ts) — the lockout module's own
  // notion of "unlocked", not a parallel one. Scoped to the admin's own
  // competition (§4 rule 3) and to real players (`is_bot = false`). Runs
  // whether or not the player is currently locked — #200 only hides the
  // button; a stale roster render or a replay is a harmless no-op, not a 4xx.
  const result = await supabase
    .from("players")
    .update({ failed_pin_attempts: 0, locked_until: null })
    .eq("id", body.playerId)
    .eq("competition_id", admin.competitionId)
    .eq("is_bot", false)
    .select("id")
    .maybeSingle();

  const settled = settlePlayerUpdate(result, "Could not clear the lockout.");
  if (settled) return settled;

  return NextResponse.json({ ok: true });
}
