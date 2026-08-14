---
type: concept
title: App Shell and Navigation
description: Root layout with fixed bottom tab bar, Switch Player button, Help button, timezone sync, and shell-metrics coordination. Excludes login route.
tags: [navigation, shell, tab-bar, layout, adr-0005]
---

# App Shell and Navigation

The root layout and navigation chrome implement ADR-0005 (App Navigation Shell) and ADR-0007 (Home Surface). The shell provides persistent navigation without a hub/dashboard.

## Root layout (`src/app/layout.tsx`)

```typescript
export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <TimezoneSync />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

- Uses Geist and Geist Mono fonts via `next/font`
- Viewport metadata includes `viewportFit: "cover"` — required for `env(safe-area-inset-*)` to report real device values (the fixed bottom tab bar relies on this)
- `TimezoneSync` component runs before `AppShell` so the timezone cookie is set early

## AppShell (`src/components/nav/AppShell.tsx`)

The `AppShell` is a `"use client"` component that conditionally shows navigation chrome:

- **Login route** (`/login`): no chrome shown at all (pre-auth, nothing to navigate to)
- **All other routes**: SwitchPlayerButton + HelpButton + TabBar rendered

```typescript
function AppShell({ children }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SwitchPlayerButton />     // fixed top-right, overlays content
      <HelpButton />             // persistent "?" link to /how-it-works
      <div style={{ paddingBottom: `${TAB_BAR_HEIGHT_REM} + env(safe-area-inset-bottom)` }}>
        {children}
      </div>
      <TabBar />
    </div>
  );
}
```

## TabBar (`src/components/nav/TabBar.tsx`)

A fixed bottom tab bar, used at every breakpoint (no swap to top nav/sidebar on tablet/desktop — ADR-0005).

### Tabs

Currently two destinations (defined in `src/components/nav/tabs.ts`):

| Tab               | Icon        | Route            |
| ----------------- | ----------- | ---------------- |
| Pick Board        | Home        | `/`              |
| Predict the Table | ListOrdered | `/predict-table` |

Only real routes get a tab. Leaderboard (#24) and Match Centre (#91) are deferred.

### Predictive tab UI

The Predict the Table tab shows a `Next up` badge when `localStorage.getItem("tipperoos.needsTablePrediction") === "true"`. This is managed via `useSyncExternalStore` for reactive updates across tabs.

### "Scroll to top" behavior

Tapping the already-active tab scrolls to the top of the page (ADR-0005). Respects `prefers-reduced-motion`.

## SwitchPlayerButton

Fixed top-right, floating above content. Clears the session cookie (`POST /api/auth/logout`) and redirects to `/login`/code entry step. Uses `bg-paper + shadow` so the overlay reads as intentional.

## HelpButton

Two-state navigation: on `/how-it-works` shows a back-arrow, on all other pages shows a `?` link to `/how-it-works`.

## Other shell elements

### TimezoneSync (`src/components/nav/TimezoneSync.tsx`)

A client component that writes the browser's IANA timezone to a `tz` cookie on mount. Server-side reads use this cookie (via `cookies()`) for kickoff/countdown rendering.

### shell-metrics

`TAB_BAR_HEIGHT_REM` and `TAB_BAR_HEIGHT_CLASS` exports ensure consistent spacing between the shell and page content.

## Related

- [Pick Board Overview](../pick-board/overview.md)
- [Timezone Handling](../navigation/timezone.md)
- [ADR-0005: App Navigation Shell](../../docs/adr/0005-app-navigation-shell.md)
