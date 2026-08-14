import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { verifySecret } from "./scrypt-secret";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

/**
 * Case-insensitive, whitespace-tolerant (copy/paste from a text/email),
 * applied identically before hashing (scripts/set-competition-code.mjs) and
 * before verifying (matchCompetitionByCode) so the two stay in agreement.
 */
export function normalizeCompetitionCode(code: string): string {
  return code.trim().toLowerCase();
}

/**
 * Pure matching logic against an already-fetched row set -- golden-value
 * testable with a fixed set of {id, codeHash} rows and known plaintext
 * codes, same pattern as scrypt-secret.ts's exported deriveKeyHex.
 *
 * Sequential, short-circuits on first match: the competitions table is
 * always tiny (a handful of rows at most), so per-row timing variance from
 * an early exit isn't a meaningful risk at this scale ("this is not a
 * bank" -- CLAUDE.md).
 */
export async function matchCompetitionByCode(
  rows: { id: string; codeHash: string }[],
  submittedCode: string,
): Promise<string | null> {
  const normalized = normalizeCompetitionCode(submittedCode);
  if (!normalized) return null;
  for (const row of rows) {
    if (await verifySecret(normalized, row.codeHash)) {
      return row.id;
    }
  }
  return null;
}

// A verified code -> competitionId mapping, kept for a warm serverless
// instance's lifetime, bounded by a TTL. Without this, every one of
// /auth/players, /auth/login and /auth/signup independently re-fetches every
// competitions row and re-derives a scrypt hash per row -- on a single login
// flow (list players, then submit) that's the same code verified twice, plus
// the PIN's own derivation, all serial. The TTL exists so a rotated
// code (scripts/set-competition-code.mjs) stops being honoured on a warm
// instance within a bounded window rather than only at its next cold start.
const CODE_CACHE_TTL_MS = 5 * 60 * 1000;
const codeCache = new Map<
  string,
  { competitionId: string; expiresAt: number }
>();

/**
 * Thin Supabase-fetching wrapper around matchCompetitionByCode (which already
 * has its own golden-value tests), plus the short-lived cache above.
 */
export async function resolveCompetitionByCode(
  supabase: SupabaseClient,
  submittedCode: string,
): Promise<string | null> {
  const normalized = normalizeCompetitionCode(submittedCode);
  if (!normalized) return null;

  const cached = codeCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.competitionId;
  }

  const { data, error } = await supabase
    .from("competitions")
    .select("id, code_hash");
  if (error) throw error;
  const competitionId = await matchCompetitionByCode(
    (data ?? []).map((row) => ({ id: row.id, codeHash: row.code_hash })),
    normalized,
  );
  if (competitionId) {
    codeCache.set(normalized, {
      competitionId,
      expiresAt: Date.now() + CODE_CACHE_TTL_MS,
    });
  }
  return competitionId;
}
