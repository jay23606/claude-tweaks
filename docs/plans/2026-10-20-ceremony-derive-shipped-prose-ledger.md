# Open Items — Wrap-up ceremony derivation treats shipped skill prose as docs-only

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | isTest-clearing remap applies to any prompt-prose path; comment names only skills/test/ (would also flip tests/fixtures/skills/*.md to impl — none exist today) | deferred | Origin: SDD Task 1 review (minor). Files: plugin/bin/lib/dispatch/ceremony-derive.js. Trigger: revisit when #3680 moves the classification into shared blast-radius isTestPath (the local remap may be dropped then). |
| 2 | build | docs/**/commands\|skills\|agents/*.md would classify as production; that cost is not recorded in the module comment | deferred | Origin: SDD Task 1 + final review (minor, errs safe). Files: plugin/bin/lib/dispatch/ceremony-derive.js. Trigger: a downstream report of a docs-only diff losing fast-lane. |
| 3 | build | blast-radius TEST_PATH_RE still classifies skills/test/*.md as test for merge-check | deferred | Origin: SDD Task 1 review. Files: plugin/bin/lib/issues/blast-radius.js. Filed as #3680 (ready). Trigger: #3680 build. |
| 4 | build | micro-plan.md condition 3 line overlong; "the same test/docs exclusion" referent blurred by the prompt-prose carve-out | deferred | Origin: SDD Task 2 + final review (minor, cosmetic). Files: plugin/skills/build/micro-plan.md. Trigger: next edit to micro-plan.md. |
| 5 | build | ceremony-derivation.md did not state that prompt prose under skills/test/ counts as production rather than test | fixed | a310da707 (ceremony-derivation.md #3477 sentence now says so). |
| 6 | build | micro-plan condition excludes tests/ before the prompt-prose carve-out (cosmetic mismatch for tests/skills/x.md) | deferred | Origin: SDD Task 2 review (minor, cosmetic). Files: plugin/skills/build/micro-plan.md. Trigger: next edit to micro-plan.md. |
| 7 | build | SDD ruling — Task 1 deviation: computeDiffFacts clears isTest on prompt-prose paths, kept local instead of changing shared isTestPath: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 8 | build | SDD ruling — final review: fixed minors 1/3/5 in one wave, left docs/fixtures carve-out and micro-plan rewrap as recorded trade-offs: ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
