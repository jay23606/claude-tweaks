# Open Items — #3511: Let verify.js combine --scope with --baseline adjudication instead of refusing the pair

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD minor: USAGE note's retry.{suite} fallback claim was true only once Task 2 landed | accepted | Shipped together on this branch (f6f8615 + 57aeed6); final-review triage: no action |
| 2 | build | SDD minor: new args tests do not re-assert non-scope errors | accepted | Already pinned by tests/bin-lib/verify/args.test.js:314-331; final-review triage: no action |
| 3 | build | SDD minor: cli.test.js scopedBaselineRepo default declares `other` before `unit` (old fail-fast workaround); incident ordering covered only by the unitFirst test | deferred | Origin: Task 2 review. Files: tests/bin-lib/verify/cli.test.js. Trigger: next edit to the #3511 CLI tests — flip the default to failing-suite-first |
| 4 | build | SDD minor: the exit-2 CLI test's `unit.log` absence check is a weak "before any check runs" proof | deferred | Origin: Task 2 review. Files: tests/bin-lib/verify/cli.test.js. Trigger: next edit to the #3511 CLI tests — assert no log dir entries instead |
| 5 | build | SDD minor: fail-fast prose lacked the --baseline exception | fixed | ade0a67 + 6acb6fe + c5753a2 (verification.md, plugin-structure.md, journey doc) |
| 6 | build | SDD minor: Task 3 edit sits beside the Re-verify scoping table, not in its rows | accepted | The table lists modes only; the paragraph under the snippet is the right home (final-review triage: no action) |
| 7 | build | SDD minor: snippet-conformance assertion label "names the one usage error" | fixed | 2582dbe |
| 8 | build | SDD minor: plan doc still quotes superseded wording ("map-form rule", "each failing check") | accepted | Historical plan file, bookkeeping only |
| 9 | build | SDD minor: continueSuitesAfterFailure is on for every failing --baseline run even when adjudication is certain to refuse (failed check has no template, or base contains HEAD) — extra suite runtime for no verdict | deferred | Origin: whole-branch review. Files: plugin/bin/verify.js, plugin/bin/lib/verify/run.js. Trigger: a --baseline run observed spending material time on a run that ends "not adjudicated" |
| 10 | build | Pre-existing: tool-scoped --scope with `--cmd-env tests=…` and no `--cmd tests` is not picked up by envOf('tests') | deferred | Origin: whole-branch fix-wave re-review (predates #3511). Files: plugin/bin/verify.js. Trigger: a tool-scoped declaration that needs --cmd-env without an explicit --cmd tests |
| 11 | build | SDD ruling — AC1.1 CLI test asserts report.scope.mode full (no prior stamp forces full, the #3401 shape): ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 12 | build | SDD ruling — every --baseline run keeps running suites after a suite failure (runChecks continueSuitesAfterFailure; types/lint still skip): ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
| 13 | build | SDD ruling — Task 3 widened to state the --baseline fail-fast exception in verification.md, plugin-structure.md and the verify journey: ratify or reverse at the Review Console (staged/sdd-ruling-3.md) | open | — |
