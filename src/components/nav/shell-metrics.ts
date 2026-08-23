// Single source of truth for the tab bar's height, shared between TabBar
// (its own height) and AppShell (the content padding that reserves space
// for it) so the two can't drift out of sync.
export const TAB_BAR_HEIGHT_CLASS = "h-16";
export const TAB_BAR_HEIGHT_REM = "4rem";

// Z-index allocation across overlay surfaces (docs/adr/0004-app-navigation-shell.md
// -- "needed before a second overlay-using feature ships"). Each tier is a
// full stacking context; a future overlay (e.g. a confirmation modal) picks
// the tier matching its role rather than inventing a new number. Not
// exported as constants: Tailwind's class scanner needs literal `z-*`
// utility classes, not an interpolated value, so this table is the source
// of truth and call sites hardcode the matching literal class.
//
//   z-10 -- persistent shell chrome (TabBar)
//   z-20 -- overlay scrims/backdrops (the "More" menu's backdrop; future modals)
//   z-30 -- overlay panels/content (the "More" menu's panel; future modals)
