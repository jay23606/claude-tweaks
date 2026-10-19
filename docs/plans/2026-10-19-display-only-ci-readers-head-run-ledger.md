# Open Items — Display-only CI readers still classify the rollup alone (#3469)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | pr-checks parseArgs --pr 7 --run (missing --run value) silently runs as --pr 7 (pre-existing --run tolerance) | deferred | SDD minor (Task 1) — pre-existing --run tolerance, not a regression |
| 2 | build | USAGE exit-3 line no longer says --run only | deferred | SDD minor (Task 1) — cosmetic |
| 3 | build | exit-2 tests for --pr malformed/both also pass pre-change (parseArgs test pins the specific error) | deferred | SDD minor (Task 1) — parseArgs test carries the discrimination |
| 4 | build | console conformance needle pending is non-discriminating (other needles carry the pin) | deferred | SDD minor (Task 2) — option-1 regex carries the pin |
| 5 | build | pack pr probe now issues a second gh pr view inside pr-checks.js (briefed design; bounded cost) | deferred | SDD minor (Task 2) — bounded by gh timeout and 60s probe limit |
| 6 | build | item 9 CI-filter JS comment cites Step 2.5 (pr-first-merge) without naming the file | deferred | SDD minor (Task 4) — cosmetic |
| 7 | build | plan doc docs/superpowers/plans/2026-10-19-display-only-ci-readers-head-run.md:7 still says pack spawns pr-checks.js --run (ruled --pr); console stale mapping now dead on the pack path | deferred | SDD final-review minor — plan doc is historical; correct or delete at spec close-out |
| 8 | build | SDD ruling — delete the plan-mandated nearCeiling size test (skill-size numbers live only in budgets.js; RAIL_BYTES enforced by context-cost rail suite): ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 9 | build | SDD ruling — pack pr probe and console fallback use pr-checks.js --pr {pr} instead of the plan's --run (console shows the PR head verdict): ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
| 10 | build | SDD ruling — fix final-review minors 3-8 in the same single fix wave: ratify or reverse at the Review Console (staged/sdd-ruling-3.md) | open | — |
