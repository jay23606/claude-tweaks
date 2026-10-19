# Open Items — Consolidate isPathContained and path-guard isAncestorOrSelf into one lexical containment primitive

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD ruling — Task 3 dispatch authorized renaming Task 2's mislabeled third conformance test (it claimed cwd-independence, pinned only a string) instead of a separate fix round: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 2 | build | SDD ruling — final review Important #2's five `rel.startsWith('..')` containment sites (hooks.js, hooks/pre-tool-use.js, visual-decide/server.js, wrap-up/engine-verify.js, skill-audit/context-cost.js) not migrated in this run; staged as a follow-up record instead: ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
| 3 | build | AC1.1 scan in `tests/path-containment-conformance.test.js` only sees single-line `startsWith(...path.sep)` forms (multi-line / destructured `sep` / `'/'` variants unscanned; none exist today) | deferred | Covered by the staged follow-up `staged/ledger-record-path-relative-containment.md` (its "widen the scan" deliverable). Origin: SDD Task 2 review. Files: tests/path-containment-conformance.test.js. Trigger: that record's build. |
| 4 | build | AC1.1 delegation test slices `isPathContained`'s body with `indexOf('\n}\n')` — fragile to reformatting | accepted | A reformat makes the test fail loudly; it cannot pass silently (final whole-branch review triage). |
| 5 | build | AC3.1 test's `/isAncestorOrSelf/` match would also accept a negated mention | accepted | Naming pin only; Task 3 review and final review judged it sufficient for AC3. |
| 6 | build | `plugin/bin/lib/reconcile/archive-merged.js` tracked-entry filter recomputes `path.join(runDir, 'work')` per entry — hoist into a const | open | — |
| 7 | build | `archive-merged.js` `orEqual` boundary (a tracked file exactly at `runDir/work`) has no test — a strict-mode mutant survives its suite (pre-existing gap; existing suite must stay unmodified, so a pin needs a new test file) | open | — |
