import type { ComponentType } from "react";
import { Home, ListOrdered, Trophy } from "lucide-react";

export interface Tab {
  href: "/" | "/leaderboard" | "/predict-table";
  label: string;
  icon: ComponentType<{ className?: string }>;
}

// Destination set (docs/adr/0005-app-navigation-shell.md): only real
// routes get a tab, no placeholder entries. Issue #90 made `/` (Pick Board)
// the second, #24 adds Leaderboard as the third.
//
// Match Centre is deliberately NOT a fourth tab. It is the Pick Board's past
// tense, not a destination (docs/adr/0013-match-centre-tense-and-axes.md
// D1): `/gameweek/[n]` is reached from a settled slot and from the
// post-result email, and `/picks/[playerId]` from a leaderboard row. Each
// axis hangs off the surface whose primary object it already is, so neither
// needs a slot of its own. This supersedes ADR 0012 D1's "Match Centre (#91)
// is still owed a tab slot".
//
// Ordered as the season is actually used: file your picks, see where that
// left you, then the season-long side bet.
export const TABS: Tab[] = [
  { href: "/", label: "Pick Board", icon: Home },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/predict-table", label: "Predict the Table", icon: ListOrdered },
];
