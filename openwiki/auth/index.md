# Files

- [Competition Codes](competition-codes.md) - How competition codes are normalized, hashed with scrypt, verified, and set per environment via interactive scripts.
- [Emoji System](emoji-system.md) - Curated kid-appropriate emoji library for player identity, mandatory at signup. Shared by client grid display and server-side validation.
- [Login Flow](login-flow.md) - Multi-step login UX covering competition-code gate, display-name selection, PIN entry, lockout display, and the never-reject fetch contract.
- [PIN Security](pin-security.md) - Scrypt-based PIN hashing, 5-attempt lockout with 15-minute auto-expiry, and optimistic-concurrency retry loop for concurrent login safety.
- [Session Management](session.md) - Stateless HMAC-signed session cookie implementation, signing, verification, and lifecycle for Tipperoos authentication.
- [Signup](signup.md) - Self-service account creation route, validation rules for display names, PINs, and emojis, and concurrency-safe uniqueness checks.
