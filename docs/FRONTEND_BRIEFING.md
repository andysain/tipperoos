# Tipperoos — Frontend/Design Agent Briefing

You're working design and frontend on this project in parallel with a separate agent doing backend. This doc gives you the project-specific context you need — not a Next.js/React/design tutorial, you're assumed to already have that expertise. Read `CLAUDE.md` for the full product spec; this is a curated entry point into it, angled at what actually affects UI/UX decisions.

## What this is

A private Premier League tipping competition for ~10–20 family/friends across several households, ages ~10+, with a few bot players. Not a general sports platform — build for this specific private group, nothing more general. Season opens **2026-08-21** (hard deadline).

## Constraints that directly shape UI decisions

- **Kid-friendly.** Youngest real users are ~10. Language and interaction design need to work for a 10-year-old, not just an adult.
- **Mobile-first, fast, responsive — a stated product requirement, not a nice-to-have.** This whole rebuild exists partly as a reaction against the old app (Streamlit) being clunky and slow. Snappy interaction matters more here than usual.
- **No gambling language, anywhere.** Use `prediction`, `pick`, `points`, `leaderboard`, `competition`. Never `bet`, `odds`, `wager`, `stake`, `payout`, `bookie` — including in copy, button labels, empty states, error messages.
- **No chat, comments, public profiles, or social features** beyond the leaderboard and the pick reveal. Don't design toward a social-app pattern.
- **All times display in `Australia/Sydney`**, even though kickoffs are UK time and everything is stored in UTC. Never show raw UTC to a user.
- **No client-side Supabase access, ever.** This is a backend architecture rule, but it affects you directly: any data a page needs comes from a Server Component or an API route the backend agent builds — never a browser-side DB call. Design your data-fetching patterns around that (Server Components pulling data server-side, or `fetch`ing your own API routes), not a client SDK.

## Design system status

**Decided** — see `docs/DESIGN_SYSTEM.md` for the full palette, type scale, radius/spacing tokens, and
component conventions (icons, motion, copy tone, gameweek-archive structure, etc.). The real tokens are already
wired into `src/app/globals.css`'s `@theme` block (`bg-ink`, `bg-accent`, `rounded-card`, etc.) — use those
Tailwind utilities, never a raw hex value. No components built yet beyond the `create-next-app` scaffold
(`src/app/page.tsx`, `src/app/layout.tsx`) — build the shared primitives (`Button`, `Badge`, `Card`, ...) the
first time a real screen needs one, per `docs/DESIGN_SYSTEM.md`'s "Component build order."

Two skills are installed for the mechanical Tailwind/mobile rules — `.claude/skills/tailwind-css` and
`.claude/skills/mobile-responsiveness` — read them before the first component, alongside `DESIGN_SYSTEM.md`:

- **Mobile-first breakpoints, no exceptions.** Unprefixed classes are the mobile base; `md:`/`lg:` layer on top. Never use `sm:` to mean "mobile" — it's a common mistake and this app is mobile-first by hard requirement.
- **`min-h-dvh`, never `min-h-screen`** — `min-h-screen` is buggy on mobile Safari, which is a real device in this player base.
- **`gap-*` for flex/grid spacing, not `space-x-*`/`space-y-*`** — the latter breaks with `flex-wrap`.
- **Opacity modifiers (`bg-black/50`), not `bg-opacity-*`** — the old opacity utilities are removed in Tailwind v4.
- **No `@apply`** — use CSS variables or extract a component instead.
- **Safe-area insets on any fixed bottom nav/bar** (`env(safe-area-inset-bottom)`) — this is a shared-family-phone app, notch/home-indicator overlap is a real annoyance to design around, not a nice-to-have.
- **`size-*` over separate `w-*`/`h-*`** when a dimension is equal on both axes.
- Use `tailwind-variants` (installed) for any component with more than one visual variant — see `docs/DESIGN_SYSTEM.md` "Component build order."
- Functional UI icons are `lucide-react` (installed), restyled to match the brand — not emoji. Emoji stay the personalization layer (bot, player emoji, flags) only.

Two skills are installed for exactly this work — `.claude/skills/tailwind-css` and `.claude/skills/mobile-responsiveness` — read them before the first component, not a tutorial recap but worth internalizing since there's no existing pattern yet to copy instead:

- **Mobile-first breakpoints, no exceptions.** Unprefixed classes are the mobile base; `md:`/`lg:` layer on top. Never use `sm:` to mean "mobile" — it's a common mistake and this app is mobile-first by hard requirement.
- **`min-h-dvh`, never `min-h-screen`** — `min-h-screen` is buggy on mobile Safari, which is a real device in this player base.
- **`gap-*` for flex/grid spacing, not `space-x-*`/`space-y-*`** — the latter breaks with `flex-wrap`.
- **Opacity modifiers (`bg-black/50`), not `bg-opacity-*`** — the old opacity utilities are removed in Tailwind v4.
- **No `@apply`** — use CSS variables or extract a component instead.
- **Safe-area insets on any fixed bottom nav/bar** (`env(safe-area-inset-bottom)`) — this is a shared-family-phone app, notch/home-indicator overlap is a real annoyance to design around, not a nice-to-have.
- **`size-*` over separate `w-*`/`h-*`** when a dimension is equal on both axes.

## The screens/flows that will need to exist

Not necessarily in build order — check with the backend agent/Andy on sequencing, since backend routes need to exist before a screen can be real (vs. a design mockup with placeholder data).

- **Login**: pick your display name from a list, enter a 4-digit PIN. A "Switch player" affordance for shared-device use (tap to log out and return to the name list) — this is a named trust mitigation in the product spec, not optional polish.
- **Signup**: private competition code (gate), display name (unique, this is the identity key — not email), PIN, optional email, mandatory emoji (chosen at signup from a grid of 12 classics or a random draw from the curated library — see `src/lib/auth/emoji-options.ts`).
- **Picks entry**: each gameweek, exactly **two** matches are open for tipping (not a full round). Player enters a full scoreline (home/away) for each, not just a result. Locks 5 minutes before kickoff. Before lock: only your own pick is visible. After lock: everyone's picks for that match become visible. Design needs a clear locked-vs-open visual state.
- **Match-2 Picker flow**: starting gameweek 2, whoever finished last the previous gameweek picks Match 2 themselves (from a deadline window, notified, with an auto-random fallback if they miss it). This is a distinct, occasional flow — needs its own notification/prompt UI, not just folded into normal picks entry.
- **Leaderboard**: ranked by season total points. Bots clearly labelled (🤖). Admin's standing shown but visually distinguished as ineligible for the season "winner" title (see Admin below).
- **The pick reveal** (`/gameweek/[n]`): everyone's picks for a settled gameweek, and every result correction with a timestamped audit entry — a trust feature, visible not buried. Not a destination of its own: it is the Pick Board's past tense (`docs/adr/0013-match-centre-tense-and-axes.md`).
- **Predict the Table**: season-long feature, captured once near season start (full 20-team ranking). Exact UI shape (full drag-reorder ranking vs. a simplified champion/top-4/relegation picker) is **still an open product decision** — flag before building, don't assume.
- **Admin screens** (small, admin-only): match result/kickoff-time correction, admin-assisted PIN reset (a "forced reset" flow — admin sets a temp PIN, player is then forced to set a real one on next login).

## Things that look like they'd need a UI decision but don't

- **Admin has no special view of anything besides the two actions above.** No "admin sees all picks early" mode — bound by the same pre-lock hiding rules as everyone else. Don't design an admin dashboard that implies broader visibility.
- **No settings/config screens** — competition code, lock timing (fixed 5 minutes), etc. are not admin-editable via UI right now.

## Domain vocabulary (read `CONTEXT.md` for the full glossary)

Worth knowing before you name components/props: **Fixture** (any of the 380 season matches) vs. **Tipped Match** (one of the 2 open for picks that gameweek) are different things. **Voided Match** (postponed after lock, no points) vs. **Skipped Slot** (postponed before lock, that gameweek just runs with 1 match instead of 2) are different, both need distinct empty/explained states in the UI, not a generic "match cancelled."

## Current backend state (as of 2026-08-01)

- Schema exists (Supabase Postgres, two environments — staging and production, see below), seeded with real season fixtures/teams.
- Auth/player-account **decisions** are made (display-name+PIN identity, session model, etc. — see `CLAUDE.md` → Identity and auth) but the actual signup/login/session **code doesn't exist yet** — the backend agent is starting there now.
- No API routes exist yet beyond a trivial server-side Supabase connectivity check on the home page.
- **Practical implication**: you can start on layout, navigation shell, the design system/component library, and screen mockups against placeholder/mock data immediately. Real data integration will follow as backend routes land — coordinate with the backend agent rather than assuming a route exists.

## How your work and backend work coexist

- Repo: Next.js App Router, TypeScript, Tailwind. `src/app/` = routes/pages, `src/lib/` = server-only backend logic (**not yours to edit** — CODEOWNERS-gated, requires Andy's explicit review to merge). Put shared UI components somewhere like `src/components/` (not yet created — your call on structure, you have the frontend expertise here).
- **Workflow**: branch → PR → CI must pass → most things auto-merge instantly, no waiting on a human. Only `src/lib/**` and `.github/workflows/**` need explicit sign-off. Your work should auto-merge freely.
- **Testing expectations for you specifically**: per `docs/standards/TESTING_STANDARD.md`, UI/layout/styling is explicitly **not** required to have automated tests — verify by actually using the feature in a browser (and on the Preview deployment URL a PR generates) instead. Logic-heavy code (scoring, auth, etc.) is the backend agent's test-first responsibility, not yours.
- Local dev: `npm run dev`, reads from the **staging** Supabase project via `.env.local` (already present in this checkout, gitignored — see `supabase-credentials.local.md` if you need the values again). Never point local dev at production.

## Old app screenshots (`docs/screenshots/`)

Three screenshots of the retired Streamlit app: `screencapture-tipperoos-streamlit-leaderboard.png`, `-match-centre.png`, `-my-predictions.png`. Useful for seeing what functionality existed and a couple of genuinely reusable interaction patterns — **not a visual/UX template to copy**. This was the World Cup version: same theme, same general player pool, but a short-tournament product, not this ongoing 38-gameweek league. A lot of what's on screen is either tournament-specific mechanics that don't exist in this rebuild, or exactly the density/clunkiness this rebuild is a reaction against.

**Patterns worth actually considering:**

- **My Predictions**: tap-to-select scoreline grid (a row of `0 1 2 3 4 5+` buttons per team, instead of a raw number input) — a strong candidate for a kid-friendly, mobile-friendly score entry control. Your version only ever needs 2 matches per gameweek though, not ~104, so you don't need the pagination ("Show 12 more") or heavy filtering it has.
- Compact stat-pill summary rows (`To tip / Saved / Locked / Missed`, or `Matches / Your rank / Your score / Top score`) — a reasonable pattern for leaderboard/picks summary.
- "Switch player" as a persistent, easy-to-find button — matches a named requirement, keep this concept.
- Bot entries clearly badge-labelled in the leaderboard — matches a named requirement, keep this concept.

**Explicitly don't carry forward:**

- The Streamlit left-sidebar page-nav structure. This whole rebuild exists partly because the old app felt clunky/slow — don't reproduce its information architecture by default.
- The old Match Centre's dense, cramped per-match comparison layout — likely a contributor to that "clunky" feedback, not a pattern to repeat. The reveal groups identical scorelines instead (`docs/adr/0013` D13).
- The score-progression line chart on the leaderboard. Explicitly out of scope for this rebuild (see `CLAUDE.md` → _Explicitly out of scope_: "Full analytics/stats pages... not carried forward for relaunch").
- **"Winner pick"** (shown locked on the My Predictions screen) and **"Advance"** columns/terminology (Match Centre, leaderboard breakdown) — both World Cup knockout-tournament concepts. There's no tournament winner pick and no advancement bonus in a league season; don't design around them. (Note: this is different from **Predict the Table**, the actual EPL season-long feature — see above — which has no old-app screenshot since it didn't exist in that version.)
- The score-breakdown columns shown (`Exact / Goal diff / Result / Advance`) reflect the old app's actual scoring code, which `CLAUDE.md` documents as having drifted from spec — the new additive formula's categories are different (`Result +3 / Goal difference +2 / Home score +1 / Away score +1 / Exact bonus +2`, no knockout-advancement term at all). If you build a similar score-breakdown UI, use the new categories, not these.
- **Elo Bot** and the "Starting +20" late-joiner bonus shown for one player — both dropped. Only three bot types exist now (Random, 1-1, Median — see `CLAUDE.md` → Identity and auth), and late joiners get 0 points for gameweeks before they joined, no starting bonus.

## Where to go for more

- `docs/DESIGN_SYSTEM.md` — palette, type scale, tokens, and component conventions (start here for visual work).
- `CLAUDE.md` — full product spec, source of truth if this doc and it ever disagree.
- `CONTEXT.md` — domain glossary.
- `BUILD_PLAN.md` — decisions log, including why things are built this way.
- `AGENTS.md` — engineering process router (branch/PR flow, non-negotiables).
- `docs/standards/TESTING_STANDARD.md` — testing/validation expectations.
