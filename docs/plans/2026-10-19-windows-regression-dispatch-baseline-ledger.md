# Open Items — windows-regression: baseline workflow_dispatch runs against the integration branch, not HEAD^1

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | Task review minor: no test for a dispatch on a fully-merged/behind branch where merge-base == HEAD (the guard is exercised only via the dispatch-on-main test) | accepted | The dispatch-on-main test already reaches the `merge-base == HEAD` branch (on main the merge-base is HEAD itself), and a behind or merged branch takes the same code path. A second fixture would cover nothing new. |
| 2 | ops | CI/CD pipeline change: `.github/workflows/windows-regression.yml`'s base step now branches on `github.event_name`. Review the workflow diff before merge (reason-not-auto: requires-signoff). Live probe: run 39309172253, dispatched on this branch, printed `Comparison base: 90de4e05e837ff0423ca6b7b058dd5100c1ab3c9 (merge-base with origin/main)` and concluded success. The 6 base-step tests report `ok` on windows-latest. | open | — |
