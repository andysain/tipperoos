import type { Route } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireAdmin } from "@/app/_lib/admin-access";
import { loadAdminHealth } from "@/app/_lib/admin-health-access";
import { loadAdminIndexCounts } from "@/app/_lib/admin-index-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  DEFAULT_TIME_ZONE,
  TIMEZONE_COOKIE_NAME,
} from "@/components/nav/timezone-cookie";
import { HealthStrip } from "@/components/admin/HealthStrip";
import { CARD_SHADOW, FOCUS, LABEL, T, TX } from "@/components/ui/tokens";

// Gated behind requireAdmin(): a non-admin session and a logged-out visitor
// both get notFound() -- 404, not 403, not a login redirect (spec §4 rule 1,
// "the surface should not announce itself"). This is a deliberate divergence
// from every other authed page, which redirects to /login.
export const dynamic = "force-dynamic";

const CARD = `flex flex-col gap-3 rounded-card border border-paper-line bg-white p-4 ${CARD_SHADOW}`;

/** One headline number. All three sit at the same size so none reads as
 *  "the big one" -- the gameweek number and a player count are peers. When
 *  `href` is set the value is a link (an arrow, not colour, is the cue --
 *  DESIGN_SYSTEM.md keeps colour off values). */
function HeadlineStat({
  term,
  value,
  href,
}: {
  term: string;
  value: number | string;
  href?: Route;
}) {
  const numeral = `${T.score} font-extrabold ${TX.base}`;
  return (
    <div className="flex flex-col gap-1">
      <dt className={`${T.caption} ${TX.muted}`}>{term}</dt>
      <dd className={numeral}>
        {href ? (
          <Link href={href} className={`${FOCUS} rounded-btn-sm`}>
            {value} <span aria-hidden="true">→</span>
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export default async function AdminIndexPage() {
  const admin = await requireAdmin();
  if (!admin) {
    notFound();
  }

  const supabase = createServerSupabaseClient();
  const cookieStore = await cookies();
  const timeZone =
    cookieStore.get(TIMEZONE_COOKIE_NAME)?.value ?? DEFAULT_TIME_ZONE;

  // The counts row resolves the season id and current gameweek; the health
  // strip reuses both rather than re-fetching them (its remaining reads --
  // two sync_log lookups, the next-gameweek pair, the locked-out count --
  // then run in one wave). The two loaders are sequential because the
  // second genuinely needs the first's output
  // (docs/standards/PERFORMANCE_TESTING_STANDARD.md §7).
  const counts = await loadAdminIndexCounts(supabase, admin.competitionId);
  const health = await loadAdminHealth(
    supabase,
    admin.competitionId,
    counts.seasonId,
    counts.currentGameweek,
    new Date(),
    timeZone,
  );

  const { submitted, skipped, outstanding } = counts.tablePredictions;
  const picks = counts.currentGameweekPicks;
  const humansTotal = counts.playersTotal - counts.botsTotal;

  // "Not tipped" == people with zero picks this gameweek -- the reminder
  // list. Null means there's no current gameweek, so the stat is inert.
  const notTipped = picks ? picks.noTips : null;
  const partlyTipped = picks ? picks.oneTip : 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 bg-paper p-4 pb-10 md:p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <p className={`${LABEL} ${TX.muted}`}>Competition admin</p>
        <h1 className={`${T.h1} font-extrabold ${TX.base}`}>Overview</h1>
      </header>

      <HealthStrip health={health} />

      <section className={CARD}>
        <p className={`${LABEL} ${TX.muted}`}>Snapshot</p>

        <dl className="grid grid-cols-3 gap-3">
          <HeadlineStat term="Players" value={counts.playersTotal} />
          <HeadlineStat term="Gameweek" value={counts.currentGameweek ?? "—"} />
          <HeadlineStat
            term="Not tipped"
            value={notTipped ?? "—"}
            href={
              notTipped && notTipped > 0
                ? ("/admin/players?filter=not-tipped" as Route)
                : undefined
            }
          />
        </dl>

        <p className={`${T.caption} ${TX.muted}`}>
          {counts.botsTotal} {counts.botsTotal === 1 ? "bot" : "bots"} ·{" "}
          {humansTotal} {humansTotal === 1 ? "person" : "people"}
          {partlyTipped > 0 ? ` · ${partlyTipped} part-tipped` : ""}
        </p>
        <p className={`${T.caption} ${TX.muted}`}>
          Predict the Table · {submitted} submitted · {skipped} skipped ·{" "}
          {outstanding} outstanding
        </p>
      </section>

      <Link
        href={{ pathname: "/admin/players" }}
        className={`flex items-center justify-between gap-2 rounded-card border border-paper-line bg-white px-4 py-3 ${FOCUS}`}
      >
        <span className={`${T.dense} font-bold ${TX.base}`}>
          Players &amp; access
        </span>
        <ChevronRight className={`size-4 ${TX.muted}`} aria-hidden="true" />
      </Link>
    </main>
  );
}
