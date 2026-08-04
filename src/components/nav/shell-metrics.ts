// Single source of truth for the tab bar's height, shared between TabBar
// (its own height) and AppShell (the content padding that reserves space
// for it) so the two can't drift out of sync.
export const TAB_BAR_HEIGHT_CLASS = "h-16";
export const TAB_BAR_HEIGHT_REM = "4rem";

// Z-index allocation across overlay surfaces (docs/adr/0004-app-navigation-shell.md
// -- "needed before a second overlay-using feature ships"). Each tier is a
// full stacking context; a future overlay (e.g. Match Centre modals) picks
// the tier matching its role rather than inventing a new number.
//
//   10 -- persistent shell chrome (TabBar, SwitchPlayerButton)
//   20 -- overlay scrims/backdrops (Predict the Table's picker drawer backdrop)
//   30 -- overlay panels/content (the picker drawer itself; future modals)
export const Z_SHELL_CHROME = 10;
export const Z_OVERLAY_BACKDROP = 20;
export const Z_OVERLAY_PANEL = 30;
