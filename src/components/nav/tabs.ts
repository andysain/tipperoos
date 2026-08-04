import type { ComponentType } from "react";
import { ListOrdered } from "lucide-react";

export interface Tab {
  href: "/predict-table";
  label: string;
  icon: ComponentType<{ className?: string }>;
}

// v1 destination set (docs/adr/0004-app-navigation-shell.md): Predict the
// Table is the only real route today. Add future tabs (Leaderboard #24,
// Match Centre, Picks entry) here as they land -- no placeholder entries.
export const TABS: Tab[] = [
  { href: "/predict-table", label: "Predict the Table", icon: ListOrdered },
];
