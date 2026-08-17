"use client";

// PROTOTYPE ROUTE -- throwaway, dev-only, not linked from nav (same
// convention as src/app/dev/tipped-match-card/, issue #15).
//
// Question: what should the leaderboard (#24) look like? Three structurally
// different variants of the same data, switchable via `?variant=`, on the
// real app shell so they're judged against real chrome and real density
// rather than in a vacuum.
//
// All three obey docs/adr/0012-leaderboard-view.md's settled decisions --
// live dense rank (D2), movement vs. last gameweek (D2), points-per-
// gameweek-since-joining (D3), everyone ranked inline with ineligibility as
// a row treatment (D5), no Median Bot special-casing (D6), accent reserved
// for 1st place + the You badge (D7), day-one drops numbers (D8). They
// disagree only about form. `?data=dayone` renders D8's variant.
//
// Delete this whole directory once a variant wins and is folded into a real
// /leaderboard route.

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "@/components/dev/PrototypeSwitcher";
import { DAY_ONE_ROWS, ROWS } from "./fixture";
import { VariantA } from "./VariantA";
import { VariantB } from "./VariantB";
import { VariantB2 } from "./VariantB2";
import { VariantB3 } from "./VariantB3";
import { VariantC } from "./VariantC";
import { VariantP } from "./VariantP";
import { VariantS } from "./VariantS";
import { VariantT } from "./VariantT";

// B won the direction (2026-08-16). B/B2/B3 now differ only in where the
// two new counts live; A and C are kept at the end for reference until the
// prototype is captured onto its throwaway branch.
// Final round (2026-08-16): B3's tap-to-open card won the direction, so
// these three are all variations ON it -- T is the tightened version, P and
// S push harder. Earlier rounds kept at the end for reference until the
// prototype is captured onto its throwaway branch.
const VARIANTS = [
  { key: "T", name: "Tightened" },
  { key: "P", name: "Podium" },
  { key: "S", name: "Ink spine" },
  { key: "B3", name: "B3 — previous (ref)" },
  { key: "B2", name: "B2 — stat line (ref)" },
  { key: "A", name: "A — league table (ref)" },
  { key: "C", name: "C — ladder (ref)" },
];

function Prototype() {
  const searchParams = useSearchParams();
  const variant = searchParams.get("variant") ?? "T";
  const [dayOne, setDayOne] = useState(false);
  const rows = dayOne ? DAY_ONE_ROWS : ROWS;

  return (
    <>
      {variant === "P" ? (
        <VariantP rows={rows} dayOne={dayOne} />
      ) : variant === "S" ? (
        <VariantS rows={rows} dayOne={dayOne} />
      ) : variant === "B3" ? (
        <VariantB3 rows={rows} dayOne={dayOne} />
      ) : variant === "B2" ? (
        <VariantB2 rows={rows} dayOne={dayOne} />
      ) : variant === "B" ? (
        <VariantB rows={rows} dayOne={dayOne} />
      ) : variant === "A" ? (
        <VariantA rows={rows} dayOne={dayOne} />
      ) : variant === "C" ? (
        <VariantC rows={rows} dayOne={dayOne} />
      ) : (
        <VariantT rows={rows} dayOne={dayOne} />
      )}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        extra={
          <button
            type="button"
            onClick={() => setDayOne((v) => !v)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              dayOne ? "bg-white text-neutral-900" : "hover:bg-white/15"
            }`}
          >
            Day one
          </button>
        }
      />
    </>
  );
}

export default function LeaderboardPrototypePage() {
  return (
    <Suspense>
      <Prototype />
    </Suspense>
  );
}
