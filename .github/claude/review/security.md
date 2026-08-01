## Your lane: security & architecture invariants

You're one of three focused reviewers looking at the PR diff above, which is
still open. Your lane is this app's specific, named security invariants —
not general correctness or spec/style conformance (other lanes cover those;
don't duplicate their work).

Check the diff against these specific invariants from `CLAUDE.md`/`AGENTS.md`:

- **No client-side Supabase calls, ever.** Every read/write must go through
  a server-side Next.js API route or Server Component
  (`src/lib/supabase/server.ts`, guarded by the `server-only` package). This
  is named as the single biggest security invariant in the app — a
  violation is how a technically-minded player could read another player's
  pre-lock picks via devtools. Grep the diff for any new Supabase client
  usage and confirm it's server-only.
- **Lock/deadline enforcement is server-side, checked against DB time,
  never a client clock or a merely-disabled UI control.** If this diff
  touches pick submission or lock logic, confirm the check happens
  server-side against a DB-derived timestamp, not something passed from
  the client or computed in the browser.
- **Session/cookie handling**: `httpOnly` + `secure` + `sameSite=Lax`, plus
  a custom header check (`x-tipperoos-client`) on state-changing routes —
  the CSRF mitigation for this threat model, since this isn't OAuth-based
  auth. If the diff adds or changes a mutating API route, confirm the
  header check is there.
- **PIN handling**: hashed via `crypto.scrypt`, never logged or returned in
  a response body; lockout logic (max 5 attempts) can't be bypassed by a
  request that omits or resets the counter unexpectedly.
- **Secrets/env vars**: nothing that looks like an API key, service-role
  key, or the competition-code env var appears hardcoded or logged.
- Kid-friendly language: `prediction`/`pick`/`points`/`leaderboard`/
  `competition` — never `bet`/`odds`/`wager`/`stake`/`payout`/`bookie`, in
  any user-facing string the diff adds.
