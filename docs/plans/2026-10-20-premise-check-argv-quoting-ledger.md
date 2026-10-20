# Open Items — Verify Premise-check argv quoting on Windows for anchors containing double quotes or backslashes

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | test names carry cross-task AC ids (AC1.1/AC2.1/AC2.2) though the Windows half is verified in Task 2 — plan-mandated naming | deferred | SDD minor (deferred), Task 1 review; final review: harmless, names now cited in the Windows log — would not change |
| 2 | build | SDD ruling — no task review for evidence-only Task 2 (no commits); controller verified Windows run 39449592427 evidence directly: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 3 | build | absent-half fixture only catches mangles that drop ALL quote/backslash chars; present half covers the rest | deferred | SDD minor (deferred), final whole-branch review; coverage holds overall |
| 4 | build | PR body should note premise-self-check.js / issue-payload.js unmodified because the conditional Windows fix did not trigger | deferred | SDD minor (deferred), final whole-branch review; for the pre-merge PR description refresh |
