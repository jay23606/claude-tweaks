# Open Items — Post-merge reconcile reports a console-never-rendered run with pending staged items as converging later

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | Journey docs still name plain `console-never-rendered` for the pending-staged case (`docs/journeys/keep-a-live-run-whose-reused-branch-backed-a-merged-pr-3416.md:33`, `resolve-the-unattended-console-in-one-process-1932.md:52-54`) | fixed | 3416 journey corrected in `cfe1f063f`; 1932 journey needs no change (its check still matches as a substring — final review) |
| 2 | build | Stale test comment `tests/bin-lib/reconcile/archive-merged.test.js` ~l.2701 still names plain `console-never-rendered` | fixed | `cfe1f063f` |
| 3 | build | Ordinary path (`archiveMergedRun`) escalation of `console-never-rendered-staged-pending` has no residue-tracking assertion of its own; only the by-number fallback (AC3.1) does | deferred | Origin: SDD Task 1 review + final review Minor 5. Files: `tests/bin-lib/reconcile/archive-merged.test.js`. Trigger: revisit if `archiveMergedRun`'s `onSkip` → `trackStuckSkip` wiring changes (shared hook already pinned for `no-pr`) |
| 4 | build | Step 4.2 reporting instruction sat inside the #3249 parenthetical (readability) | fixed | Moved to its own paragraph in `cfe1f063f` |
| 5 | build | AC1.1 test does not assert the retired "no later pass converges it on its own" wording is absent | deferred | Origin: SDD Task 2 review + final review Minor 6. Files: `tests/pr-first-merge.test.js`. Trigger: revisit only if that wording is ever reintroduced; final review judged the assertion unnecessary |
| 6 | build | Ruling: implementer model = Fast (haiku) despite SDD's mid-tier floor for prose-described tasks — /build's size:low → Fast override is explicit and binding — costs a possible extra fix round | observation | — |
| 7 | build | Ruling: final-review Minors 5 and 6 parked, not in the fix wave — reviewer rated both acceptable as deferred — costs a missed regression on the ordinary path only if its onSkip wiring is removed | observation | — |
