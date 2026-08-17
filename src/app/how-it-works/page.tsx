import { redirect } from "next/navigation";
import { getSessionPlayerId } from "@/app/_lib/session-cookie";
import {
  BOLD_CALL_BONUS,
  MAX_BOLD_CALLS,
  PLACEMENT_POINTS_BY_DISTANCE,
  TABLE_BANDS,
} from "@/lib/scoring/predict-table";
import { NO_PICK_POINTS, WRONG_WAY_ROUND_POINTS } from "@/lib/scoring/match";
import { getMatchBreakdown } from "@/components/scoring/match-breakdown";
import {
  TableScoringTable,
  WeeklyScoringTable,
} from "@/components/scoring/ScoringSummary";

export const dynamic = "force-dynamic";

const workedExample = getMatchBreakdown(2, 1, 2, 1);

function ExampleRows() {
  return (
    <div className="flex flex-col gap-2 rounded-btn bg-paper p-3 text-sm">
      <p className="font-bold text-ink">
        You picked 2–1. The match finished 2–1.
      </p>
      {workedExample.rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-3 text-ink/75">
          <span>{row.label}</span>
          <strong className="text-success">
            {row.points === null ? "—" : `+${row.points}`}
          </strong>
        </div>
      ))}
    </div>
  );
}

export default async function HowItWorksPage() {
  if (!(await getSessionPlayerId())) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 bg-paper p-4 pb-10 md:p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-[0.08em] text-ink/55 uppercase">
          Tipperoos guide
        </p>
        <h1 className="text-[1.9rem] font-extrabold text-ink">How it works</h1>
        <p className="max-w-[52ch] text-[1.0625rem] text-ink/75">
          A quick guide to your week, your points, and Predict the Table.
        </p>
      </header>

      <section id="your-week" className="flex scroll-mt-4 flex-col gap-3">
        <h2 className="text-[1.3rem] font-bold text-ink">Your week</h2>
        <p>
          You get two Tipped Matches each gameweek. The app chooses them for
          you: one is the top matchup and one is a random pick.
        </p>
        <p>
          Choose a full scoreline for each match. Your pick closes five minutes
          before kickoff. Nothing is filled in for you.
        </p>
      </section>

      <section
        id="how-your-pick-scores"
        className="flex scroll-mt-4 flex-col gap-3"
      >
        <h2 className="text-[1.3rem] font-bold text-ink">
          How your pick scores
        </h2>
        <p>
          Points can come from the result, the goal difference, and each
          team&apos;s score. They all stack when they match.
        </p>
        <h3 className="text-base font-bold text-ink">Weekly points ladder</h3>
        <WeeklyScoringTable />
        <ExampleRows />
        <p>
          There is no extra jackpot for an exact scoreline. The points above
          come from the parts that match.
        </p>
      </section>

      <section id="wrong-way-round" className="flex scroll-mt-4 flex-col gap-3">
        <h2 className="text-[1.3rem] font-bold text-ink">Wrong Way Round</h2>
        <p>
          If you picked 2–1 and the match finished 1–2, you found the exact
          scoreline with the teams swapped. That is called Wrong Way Round.
        </p>
        <div className="rounded-btn bg-paper p-3 text-sm text-ink">
          <p className="font-bold">Example</p>
          <p>You said 2–1. It finished 1–2. That is Wrong Way Round.</p>
          <p className="mt-2 font-extrabold text-success">
            It earns +{WRONG_WAY_ROUND_POINTS} point.
          </p>
        </div>
        <p>
          It is separate from the usual rows, and it cannot happen in a draw.
        </p>
      </section>

      <section
        id="if-you-dont-pick"
        className="flex scroll-mt-4 flex-col gap-3"
      >
        <h2 className="text-[1.3rem] font-bold text-ink">
          If you don&apos;t pick
        </h2>
        <p>
          No pick means no points. The app never makes up a scoreline for you.
        </p>
        <p>
          Missing a week does not mean you are a bad predictor. On the
          leaderboard, the small <strong>/wk</strong> number beside your points
          is how many points you average for each gameweek since you joined — so
          joining late, or missing a couple of weeks, does not make your record
          look worse than it is.
        </p>
        <p>
          Bots play along every week for fun, but they cannot win the season, so
          they do not take a place on the leaderboard — the numbers you see are
          the players you are actually racing.
        </p>
        <div className="rounded-btn bg-paper p-3 text-sm text-ink">
          <p className="font-bold">Example</p>
          <p>
            You did not file a pick for Arsenal vs Chelsea. The match finished
            2–0.
          </p>
          <p className="mt-2 font-extrabold text-ink/60">
            You score {NO_PICK_POINTS} points.
          </p>
        </div>
      </section>

      <section
        id="predict-the-table"
        className="flex scroll-mt-4 flex-col gap-3"
      >
        <h2 className="text-[1.3rem] font-bold text-ink">Predict the Table</h2>
        <p>
          Put all 20 clubs into seven Table Bands. A club in the right Band
          earns {PLACEMENT_POINTS_BY_DISTANCE[0]} points; one Band away earns{" "}
          {PLACEMENT_POINTS_BY_DISTANCE[1]}, and two Bands away earns{" "}
          {PLACEMENT_POINTS_BY_DISTANCE[2]}.
        </p>
        <p>
          An exact Band Bonus means every club in that Band is right. The order
          of clubs inside the Band does not matter.
        </p>
        <p>
          A Bold Call is a correct club placement made by no more than roughly
          one in ten eligible players. It earns {BOLD_CALL_BONUS} points. Only
          your best {MAX_BOLD_CALLS} Bold Calls count.
        </p>
        <h3 className="text-base font-bold text-ink">
          Predict the Table scoring ladder
        </h3>
        <TableScoringTable />
        <div className="rounded-btn bg-white p-3 text-sm text-ink/75 shadow-card">
          <p className="font-bold text-ink">The seven Bands</p>
          <p>{TABLE_BANDS.map((band) => band.name).join(" · ")}</p>
        </div>
        <p>These points stay separate from your weekly points.</p>
      </section>

      <section id="who-wins" className="flex scroll-mt-4 flex-col gap-3">
        <h2 className="text-[1.3rem] font-bold text-ink">Who wins</h2>
        <p>
          The season winner is always a person. Bots play for fun and cannot win
          the season title.
        </p>
        <p>
          The Median Bot is a benchmark line. It shows the crowd&apos;s middle
          prediction, so beating it is a fun challenge.
        </p>
      </section>
    </main>
  );
}
