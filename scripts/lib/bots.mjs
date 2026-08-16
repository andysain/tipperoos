// Shared bot provisioning for issue #35, called by both
// scripts/seed-bots.mjs (standalone, for a competition that already exists)
// and scripts/bootstrap-competition.mjs (so a brand-new competition can
// never launch without its bots).
//
// Bots are ordinary `players` rows -- same table, same per-competition
// display-name uniqueness, same NOT NULL pin_hash. What makes them bots is
// `is_bot = true` plus a `bot_type` from the `valid_bot_type` check
// constraint (supabase/migrations/20260801045416_schema_v1.sql:71-73).

import { randomBytes } from "node:crypto";
import { hashSecret } from "./scrypt-secret.mjs";

// Display names carried forward from the old app's BOT_SPECS
// (worldcup-2026-final:src/tipperoos/core/constants.py:84-89), minus the
// dropped ELO bot. All three pass validateDisplayName (2-20 chars,
// letters/numbers/spaces/apostrophes/hyphens).
//
// The emoji is 🤖 for all three because CLAUDE.md -> Identity and auth
// specifies bots are "clearly labelled on the leaderboard (e.g. 🤖)" -- it
// is the label, not a personalization, so it should not vary by bot.
export const BOT_SPECS = [
  { botType: "random", displayName: "Random Bot", emoji: "🤖" },
  { botType: "one_one", displayName: "1-1 Bot", emoji: "🤖" },
  { botType: "median", displayName: "Median Bot", emoji: "🤖" },
];

/**
 * A bot never logs in -- `src/app/api/auth/players/route.ts` filters
 * `is_bot` out of the login list entirely -- but `players.pin_hash` is NOT
 * NULL, so each one gets a throwaway random secret that is hashed and then
 * discarded. Nobody, including the admin, ever knows it. Same thing the old
 * app did (worldcup-2026-final:src/tipperoos/services/players.py:113).
 */
async function throwawayPinHash() {
  return hashSecret(randomBytes(32).toString("hex"));
}

/**
 * Creates whichever of the three bots this competition is missing.
 * Idempotent: an existing bot is left exactly as it is, never updated and
 * never duplicated, so re-running is always safe.
 *
 * Throws if a human in this competition already holds a bot's display name
 * -- that would otherwise fail on the per-competition uniqueness index
 * (20260804010000_competitions.sql:31-33) with an opaque 23505. Failing
 * loudly and naming the conflict is better than silently suffixing the bot
 * to "Random Bot 2", which nobody asked for and nobody would notice.
 *
 * @returns {Promise<{created: string[], existing: string[]}>}
 */
export async function ensureCompetitionBots(supabase, competitionId) {
  const { data: players, error } = await supabase
    .from("players")
    .select("id, display_name, is_bot, bot_type")
    .eq("competition_id", competitionId)
    .order("display_name");
  if (error) throw error;

  const existingBotTypes = new Set(
    (players ?? []).filter((p) => p.is_bot).map((p) => p.bot_type),
  );
  const humanNamesLower = new Set(
    (players ?? [])
      .filter((p) => !p.is_bot)
      .map((p) => p.display_name.toLowerCase()),
  );

  const missing = BOT_SPECS.filter(
    (spec) => !existingBotTypes.has(spec.botType),
  );

  for (const spec of missing) {
    if (humanNamesLower.has(spec.displayName.toLowerCase())) {
      throw new Error(
        `Cannot create the ${spec.botType} bot: a player in this competition ` +
          `is already called "${spec.displayName}". Rename that player (or the ` +
          `bot, in scripts/lib/bots.mjs) and re-run.`,
      );
    }
  }

  const rows = await Promise.all(
    missing.map(async (spec) => ({
      competition_id: competitionId,
      display_name: spec.displayName,
      emoji: spec.emoji,
      pin_hash: await throwawayPinHash(),
      is_admin: false,
      is_bot: true,
      bot_type: spec.botType,
      pin_reset_required: false,
    })),
  );

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("players").insert(rows);
    if (insertError) throw insertError;
  }

  return {
    created: missing.map((spec) => spec.displayName),
    existing: BOT_SPECS.filter((spec) =>
      existingBotTypes.has(spec.botType),
    ).map((spec) => spec.displayName),
  };
}
