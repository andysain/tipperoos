import type { ComponentType } from "react";
import { Home, ListOrdered, Trophy } from "lucide-react";

export interface Tab {
  href: "/" | "/leaderboard" | "/predict-table";
  label: string;
  icon: ComponentType<{ className?: string }>;
}

// Destination set (docs/adr/0005-app-navigation-shell.md): only real
// routes get a tab, no placeholder entries. Issue #90 made `/` (Pick Board)
// the second, #24 adds Leaderboard as the third. Match Centre (#91) still
// doesn't exist, so it isn't here yet. Add future tabs as they land.
//
// Ordered as the season is actually used: file your picks, see where that
// left you, then the season-long side bet.
export const TABS: Tab[] = [
  { href: "/", label: "Pick Board", icon: Home },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/predict-table", label: "Predict the Table", icon: ListOrdered },
];
