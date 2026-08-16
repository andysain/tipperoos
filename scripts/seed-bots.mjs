// One-off script for issue #35: creates the three bot players (Random Bot,
// 1-1 Bot, Median Bot) for an existing competition. Run manually, once per
// environment/competition, same pattern as seed-fixtures.mjs and
// set-competition-code.mjs.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-bots.mjs
//
// Competitions created from scratch by bootstrap-competition.mjs already get
// their bots as part of that run -- this script is for the competition that
// predates issue #35, and as the repair path if bootstrap's bot step fails
// after the competition itself succeeded.
//
// Idempotent: re-running creates only what is missing.

import { createClient } from "@supabase/supabase-js";
import { ensureCompetitionBots } from "./lib/bots.mjs";
import { prompt } from "./lib/prompt.mjs";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Mirrors set-competition-code.mjs's selector. Deliberately never "seed
// every competition": the placeholder row from the #68 migration
// (20260804010000_competitions.sql:22-23) is still present in every
// environment, and seeding it would leave three orphan bots attached to a
// competition with no players and no gameweeks. Ordered, per AGENTS.md --
// an unordered numbered list could mean a different competition between two
// runs with nothing on screen to reveal it.
async function selectCompetition(competitions) {
  if (competitions.length === 1) {
    return competitions[0];
  }

  console.log("Multiple competitions found:");
  competitions.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.name} (${c.id.slice(0, 8)})`);
  });

  const answer = await prompt(
    `Choose a competition (1-${competitions.length}): `,
  );
  const index = Number.parseInt(answer, 10) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= competitions.length) {
    throw new Error(`Invalid choice: "${answer}".`);
  }
  return competitions[index];
}

async function main() {
  const { data: competitions, error } = await supabase
    .from("competitions")
    .select("id, name")
    .order("created_at");
  if (error) throw error;

  if (competitions.length === 0) {
    throw new Error(
      "No competitions row found -- run bootstrap-competition.mjs first.",
    );
  }

  const competition = await selectCompetition(competitions);
  console.log(`Seeding bots for competition "${competition.name}".`);

  const { created, existing } = await ensureCompetitionBots(
    supabase,
    competition.id,
  );

  for (const name of existing) {
    console.log(`  already present: ${name}`);
  }
  for (const name of created) {
    console.log(`  created: ${name}`);
  }
  console.log(
    created.length === 0
      ? "Nothing to do -- all three bots already exist."
      : `Created ${created.length} bot(s).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
