A code wiki for the Tipperoos repository.

## What this wiki is for

Just-in-time context for coding agents and developers. It is an **evidence index over the code**, not a spec. It answers "where does this live, what shape is it, what invariant must I not break" fast enough to be worth reading before a change.

It is not the source of truth for product behavior. The hierarchy is:

1. **Source code and tests** — authoritative for what the system does.
2. **`CLAUDE.md`, `docs/adr/`, `docs/standards/`** — authoritative for what it is _supposed_ to do and why.
3. **This wiki** — a navigational layer over both, plus an explicit record of where 1 and 2 disagree.

When the wiki contradicts the code, the code wins and the wiki is a bug.

## How to use it

- Start at [quickstart.md](quickstart.md). Its **task-routing table** maps an intent to the page, the source files, and the tests — go there before grepping blind.
- Read the **Known implementation/spec divergences** table in the quickstart before trusting any CLAUDE.md claim about deadlines, locks, bots, or admin capability. Several documented behaviors are specified but unbuilt.
- Read the **Key invariants** list before touching auth, picks, scores, or any Supabase query. Those are the rules whose violation is a security bug, not a style problem.
- Treat a page's "deferred"/"not implemented" notes as load-bearing. A large part of this wiki's value is recording what does _not_ exist yet, so an agent doesn't go looking for a scoring engine or a results sync that was never built.

## Conventions this wiki holds to

- **No line numbers, no file byte sizes, no commit-count-of-the-day.** They rot within a sprint and mislead the next reader. Anchor to symbol names, file paths, and constant names — things an agent can grep for.
- **Name the real symbol.** If a page describes a function, use the identifier that actually appears in the code, so a grep from the page lands. Say so explicitly when a helper is module-private.
- **Prefer a stated invariant over a restated implementation.** Paraphrasing a function body ages badly; naming the property it must preserve does not.
- **Divergences are content, not embarrassments.** When the code and the spec disagree, record both sides and point at the evidence.
- **Every page carries frontmatter** (`type`, `title`, `description`, `tags`) and a `## Related` section of relative links.

## Maintenance

Generated pages are refreshed by the scheduled `openwiki-update.yml` workflow, which opens a PR. Do not hand-edit generated pages as a routine — fix the source code or the docs and let the wiki regenerate. Hand-edit only to correct a factual error the generator got wrong, and expect the next run to re-examine it.
