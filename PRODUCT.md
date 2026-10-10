# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Mobile web, installed as a home-screen shortcut at most. Phones are the primary device, and they are often a family phone shared between several players.

## Users

A private group of about 10–20 family members and friends across several households, aged about 10 and up, plus a few clearly labelled bot players (Random, 1-1, Median).

- **Primary design target: adults, kept kid-safe.** When adult and child needs pull in different directions (density, wording, how much a screen explains), design for the adults' pace and information density. Children are covered by the language and safety rules below, with parents helping where needed. A 10-year-old must never meet unsafe, gambling-flavoured or hostile copy, but a screen doesn't have to be fully self-explanatory to them unaided.
- **Weekly job:** open the app, file a full-scoreline pick for each of this gameweek's two tipped matches before they lock, then come back later to see what everyone else picked and where they stand.
- **Season job:** fill in Predict the Table once before the season (it stays editable until 31 Aug 2026), then follow how it's tracking.
- **Competition Admin:** one per competition, and also a player. Their job is operational: unblocking players (PIN reset, clearing a lockout), fixing a player's details, checking the fixture sync is alive, rotating the competition code. The realistic moment is a parent unblocking a kid on a phone, mid-Saturday. Admins can never edit match results and never see picks early. Scope and phasing are in `docs/admin-ui-spec.md`. Phase 1 has shipped (`/admin`, `/admin/players`).

## Product Purpose

Tipperoos is a friendly, season-long Premier League prediction competition for one specific private group. Each gameweek opens exactly two auto-selected matches for full-scoreline picks. Points stack additively (maximum 7 per match). A standalone Predict the Table competition runs alongside the weekly picks.

It replaces a retired Streamlit World Cup app that felt clunky and slow. Speed and snappy mobile interaction are product requirements in their own right.

**Success this season means:**

1. Almost every human player files both picks every gameweek without being chased.
2. The whole group, kids included, is still playing at gameweek 38. There is no mid-season drop-off.

## Positioning

A tiny, curated weekly surface for one family-and-friends group, not a sports platform. Two picks a week, auto-selected so nobody has to choose, scored by a fixed additive formula that rewards judgement over luck (no exact-scoreline jackpot). Bots provide a reference line: the Median Bot is the crowd's consensus, a benchmark players can try to beat. It is private by construction: a competition code gates even the login list.

## Operating Context

- **Rhythm:** about 38 gameweeks. The next gameweek's matches are selected about 4–5 days ahead. Picks lock 5 minutes before kickoff, enforced server-side. Other players' picks stay hidden until lock, then show on the pick reveal (`/gameweek/[n]`).
- **Shared devices:** a "Switch player" control is how one phone serves a household. Login is pick-your-name plus a 4-digit PIN, behind the competition code.
- **Time:** kickoffs are UK time but players read them in their own browser timezone (most players are in Australia). Emails render in Australia/Sydney.
- **Notifications:** email only, and email is optional per player. There's a pre-lock reminder and a post-result "you scored X, you're now rank Y" email. The second is the main retention lever.
- **Surfaces:** pick board (`/`), leaderboard (`/leaderboard`, with Season Total and Predict the Table segments), Pick Reveal (`/gameweek/[n]`), a player's Picks Record (`/picks/[playerId]`), Predict the Table, How it works (`/how-it-works`), login/signup, forced PIN reset, admin.
- **Navigation** (ADR 0005): one fixed bottom tab bar at every breakpoint, with three destination tabs plus a "More" menu holding Switch player, How it works, and Admin for admins. Switch player always does a full navigation to `/login`, so nothing from one player's session survives into the next player's on a shared phone.

## Capabilities and Constraints

- Product spec and decisions: `CLAUDE.md` (wins on product behaviour), `docs/adr/0001–0013`, glossary `CONTEXT.md`, UI briefing `docs/FRONTEND_BRIEFING.md`.
- **Names:** `CONTEXT.md` is the glossary for screen and domain names. For example, say "Pick Reveal", never "Match Centre".
- **Language:** use prediction, pick, points, leaderboard, competition. Never use bet, odds, wager, stake, payout or bookie, anywhere, including errors and empty states.
- **No social features** beyond the leaderboard and the pick reveal: no chat, comments or public profiles.
- **Point values are derived, never written out by hand.** Any copy or UI that states a point value reads it from `src/lib/scoring/**` or quotes `CLAUDE.md`. Copied numbers have already drifted out of date twice (`docs/in-app-help-spec.md`).
- **What "fast" means here:** slowness has come almost entirely from server round trips, measured in Supabase calls per request, plus one touch-input delay that hurt INP on mobile. It has not come from the client bundle. See `docs/standards/PERFORMANCE_TESTING_STANDARD.md`.
- **Nothing pre-filled:** no pick means no points. The leaderboard shows points per gameweek played next to the total, so absence doesn't read as poor form.
- **Fairness:** the home screen shows only a player's own picks and outcomes. Comparison lives on the reveal. Nobody, admins included, can see picks early. Every result edit gets an audit entry shown on the reveal.
- **Title eligibility:** bots can never win the season. Late joiners can win the season but not Predict the Table.
- **Stack:** Next.js (App Router) on Vercel, Supabase Postgres reached only through server-side routes, Tailwind v4 + tailwind-variants, lucide-react icons. Free-tier hosting only.

## Brand Commitments

- The name is **Tipperoos**.
- **Voice:** kid-friendly, warm, never scolding. Playful, not childish. Copy tone rules live in `docs/DESIGN_SYSTEM.md`. The admin area is the exception: plain, adult language, where every destructive action asks for confirmation and states its consequence in the second person. The no-gambling-words rule still applies there.
- **No Premier League branding and no club crests** (trademark caution). Clubs are identified by name, 3-letter code and kit colours.
- **Emoji are for personalization and awards only:** the player's emoji (chosen from a curated library), 🤖 for bots, and award marks for something a player achieved (e.g. the 🔥 streak badge). Functional icons are lucide.
- The visual system ("The Matchday Program") lives in `DESIGN.md`, which is the visual authority. `docs/DESIGN_SYSTEM.md` keeps the decision history behind it.

## Evidence on Hand

- A live production app with real players in the 2026–27 season. Old-app screenshots are in `docs/screenshots/`. UI findings from production are in `docs/production-ui-findings.md`.
- Production UI defects found since launch, and where each was filed, are tracked in `docs/production-ui-findings.md`.
- **Decided (issue #214):** how players compare Predict the Table entries now that they're locked is "G", the dumbbell view on `/predict-table/[playerId]`: the real table as the spine, both players' calls as marks with bars showing how far off each was, points per club and per exactly-right Band. Settled in an in-app prototype; issue #214 carries the design and its decision log. G for one player is built too (issue #226): your own scored table on `/predict-table`, and another player's table on its own when you have none to compare.
- There are no testimonials, usage metrics or engagement data on record. Don't invent any.

## Product Principles

1. **Filing both picks must be effortless.** Picks filed every week is the main measure of success, so the pick board is the product's centre of gravity.
2. **Keep everyone in it all season.** Design so a player who is behind, joined late or missed a week still has a reason to come back.
3. **Fast beats feature-rich.** Snappy mobile interaction is a requirement. Cut scope before adding latency.
4. **Fairness you can't argue with.** Pick the simplest, least disputable rule, and make visibility rules hold by construction.
5. **Adult density, kid-safe tone.** Respect adult players' time and attention without ever letting the language or mechanics feel unsafe for a 10-year-old.

## Accessibility & Inclusion

No group-specific needs beyond the documented standards: the contrast floor, `prefers-reduced-motion`, tabular numerals, and safe-area insets for a mobile-first layout.
