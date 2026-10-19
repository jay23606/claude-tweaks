# Open Items — pr-first-merge Step 3 misses the 'Protected branch rules not configured' auto-merge signature

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | tests/pr-first-merge.test.js #3269 AC3.1's includes('2026-10-18') is non-discriminating (PR #3450's literal carries the same date); the PR #3427 check in carriesCleanStatus is the real pin — tighten to 'PR #3427, 2026-10-18' | fixed | Tightened AC3.1 to includes('PR #3427, 2026-10-18') — `4270d8d7c` |
| 2 | build | #3269 AC2.1 control checks the lead paragraph only while the live check reads all of item 1 — harmless since AC3.1 went red at base | accepted | Harmless: the base file carries zero occurrences of the new literal (`git show origin/main:plugin/skills/_shared/pr-first-merge.md`), so AC3.1 is red at base independent of the control; freezing all of item 1 would copy a long block for no added discrimination |
| 3 | wrap-up | pr — PR #3637 — this run's own pr-first PR; disposition is Phase 4's merge decision | observation | — |
| 4 | wrap-up | residue sweep suite probe did not run (skipped via --no-suite) — the suite state comes from the runner's verification stamp instead | observation | — |
