# Open Items — #3333 wrap-up: spec-qualify the brief PR run comment under multi-spec

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD ruling — Task 1's new tests go after the TRUST_* constants, not the plan's ~1925 hint: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 2 | build | SDD minor — two new engine-verify tests share the AC4.1 prefix label | deferred | Final whole-branch review triaged: cosmetic, leave |
| 3 | build | SDD minor — sibling-spec brief:{m} test is a guard, not revert-proven | deferred | Final whole-branch review triaged: settled by its breakage checks (dropped ` -->` and any-`brief:` prefix both turn it red); no change |
| 4 | build | SDD minor — new engine-verify tests use compact object layout vs expanded neighbours | deferred | Final whole-branch review triaged: cosmetic, leave |
| 5 | build | SDD minor — pr-run-comments.test.js Try it `assert.match(tryIt, /brief/)` was non-discriminating | fixed | d81746d43 — now asserts brief:{n} precedes plain brief inside the Try it bullet |
| 6 | build | SDD minor — pr-run-comments.test.js Try it `doesNotMatch` is a single-phrasing negative pin | deferred | Final whole-branch review triaged: acceptable; the positive order assertion added in d81746d43 now carries the discrimination |
| 7 | build | SDD minor — entry-paths.md Try it fallback borrowed the pointer-only Brief bullet's read order and ### Confirmed clause | fixed | d81746d43 — order written inline in the Try it bullet |
| 8 | build | SDD ruling — run the one final-review fix wave on Minors 1-3 plus strengthening the Try it assertion: ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
| 9 | review | Low (3b, reproduced) — engine-verify.js:776 plain `brief` fallback is not record-scoped: a trusted plain brief with ### Confirmed satisfies a record whose own brief:{n} is absent | accepted | Spec Deliverable 2 mandates the plain fallback (single-spec runs and pre-change briefs); pr-run-comments.md read side states it; behavior equals the pre-change reader, not a regression |
