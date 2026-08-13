# Files

- [Auth API Routes](auth.md) - Login, logout, signup, and player-list API routes — all requiring custom CSRF header, session cookie management, and competition-code gating.
- [API Route Overview](overview.md) - Complete inventory of all API routes — auth, picks, sync, table-predictions — with common patterns (CSRF, session cookie, camelCase JSON).
- [Picks API Route](picks.md) - Save/re-edit a match prediction — upsert pattern, lock enforcement, competition-scoped match verification, score validation.
