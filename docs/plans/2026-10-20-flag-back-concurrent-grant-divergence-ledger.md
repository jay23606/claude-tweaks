# Open Items — Extend #2719's concurrent-grant-divergence logging to flag-back rows

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | tests/backlog-refine-flagback-divergence.test.js tests 3-5: the pinned() go-red half probes PRE_TEMPLATES, which can never match prose-paragraph patterns, so that half is vacuous; real go-red is the RED run against pre-change files | deferred | SDD task review minor (deferred) — non-blocking test hygiene |
| 2 | build | tests/backlog-refine-flagback-divergence.test.js tests 3 and 5 depend on [\s\S]{0,700}/{0,2200} proximity windows — brittle to harmless paragraph reflow | deferred | SDD task review minor (deferred) — non-blocking test hygiene |
| 3 | build | SDD ruling — pulled review minors #1 (false needs-scoring example) and #2 (carve-out missing human-flagged re-authorize rows) into fix round 1 because fast-lane skips the whole-branch review: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 4 | build | PRE_FLAGBACK_PARA full-paragraph go-red probe in tests/backlog-refine-flagback-divergence.test.js goes stale on any later edit to that paragraph | deferred | SDD re-review out-of-scope observation — non-blocking test hygiene |
| 5 | wrap-up | Items 1, 2 and 4 were mis-deferred (test-file minors in this diff are fix-now per _shared/deferral-gate.md; "minor / non-blocking" is not a defer reason) — rewrote the test: pins scoped to the added paragraph (no proximity windows) and proved by in-memory clause mutation (no frozen paragraph copy) | fixed | `fe0ae68ad` — tests/backlog-refine-flagback-divergence.test.js, 9/9 pass |
| 6 | wrap-up | pr — PR #3781 — this run's own pr-first PR; disposition is Phase 4's merge decision | observation | — |
| 7 | wrap-up | residue suite probe — skipped via --no-suite; suite state taken from the runner stamp (full scope, 14301 tests / 0 fail at a14d00ef1; re-verified after fe0ae68ad) | observation | — |
