import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin-access";
import { loadAdminHealth } from "@/app/_lib/admin-health-access";
import {
  loadAdminIndexCounts,
  type GameweekPickBuckets,
} from "@/app/_lib/admin-index-access";
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

function Stat({ term, value }: { term: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className={`${T.caption} ${TX.muted}`}>{term}</dt>
      <dd className={`${T.score} font-extrabold ${TX.base}`}>{value}</dd>
    </div>
  );
}

function gameweekTipStats(
  picks: GameweekPickBuckets,
): { term: string; value: number }[] {
  if (picks.tippedMatchCount >= 2) {
    return [
      { term: "No tips", value: picks.noTips },
      { term: "One tip", value: picks.oneTip },
      { term: "Both tips", value: picks.allTips },
    ];
  }
  // A Skipped-Slot week has a single tipped match -- a player either filed it
  // or didn't, so "one tip" can't happen.
  return [
    { term: "No tips", value: picks.noTips },
    { term: "Tipped", value: picks.allTips },
  ];
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
  const gwStats = counts.currentGameweekPicks
    ? gameweekTipStats(counts.currentGameweekPicks)
    : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 bg-paper p-4 pb-10 md:p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <p className={`${LABEL} ${TX.muted}`}>Competition admin</p>
        <h1 className={`${T.h1} font-extrabold ${TX.base}`}>Overview</h1>
      </header>

      <HealthStrip health={health} />

      <section className="flex flex-col gap-3">
        <div className={CARD}>
          <p className={`${LABEL} ${TX.muted}`}>Players</p>
          <p className={`${T.score} font-extrabold ${TX.base}`}>
            {counts.playersTotal}
          </p>
          <p className={`${T.caption} ${TX.muted}`}>
            {counts.botsTotal} {counts.botsTotal === 1 ? "bot" : "bots"}
          </p>
        </div>

        <div className={CARD}>
          <div className="flex items-baseline justify-between gap-3">
            <p className={`${LABEL} ${TX.muted}`}>Current gameweek</p>
            <p className={`${T.score} font-extrabold ${TX.base}`}>
              {counts.currentGameweek === null
                ? "None yet"
                : counts.currentGameweek}
            </p>
          </div>
          {gwStats ? (
            <dl
              className={`grid gap-3 ${gwStats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
            >
              {gwStats.map((s) => (
                <Stat key={s.term} term={s.term} value={s.value} />
              ))}
            </dl>
          ) : null}
        </div>

        <div className={CARD}>
          <p className={`${LABEL} ${TX.muted}`}>Predict the Table</p>
          <dl className="grid grid-cols-3 gap-3">
            <Stat term="Submitted" value={submitted} />
            <Stat term="Skipped" value={skipped} />
            <Stat term="Outstanding" value={outstanding} />
          </dl>
        </div>
      </section>

      <nav className="flex flex-col gap-2">
        <Link
          href={{ pathname: "/admin/players" }}
          className={`flex items-center justify-between rounded-card border border-paper-line bg-white p-4 ${CARD_SHADOW} ${FOCUS}`}
        >
          <span className={`${T.dense} font-bold ${TX.base}`}>
            Players &amp; access
          </span>
          <span className={`${T.caption} ${TX.muted}`}>
            {counts.playersTotal} in this competition →
          </span>
        </Link>
      </nav>
    </main>
  );
}
