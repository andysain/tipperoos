import type { ComponentType } from "react";
import { Home, ListOrdered } from "lucide-react";

export interface Tab {
  href: "/" | "/predict-table";
  label: string;
  icon: ComponentType<{ className?: string }>;
}

// v1 destination set (docs/adr/0005-app-navigation-shell.md): only real
// routes get a tab, no placeholder entries. Issue #90 makes `/` (Pick
// Board) the second real destination -- Leaderboard (#24) and Match Centre
// (#91) still don't exist, so they're not added yet. Add future tabs here
// as they land.
export const TABS: Tab[] = [
  { href: "/", label: "Pick Board", icon: Home },
  { href: "/predict-table", label: "Predict the Table", icon: ListOrdered },
];
