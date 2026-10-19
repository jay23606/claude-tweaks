# Open Items — windows-regression: baseline workflow_dispatch runs against the integration branch, not HEAD^1

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | Task review minor: no test for a dispatch on a fully-merged/behind branch where merge-base == HEAD (the guard is exercised only via the dispatch-on-main test) | accepted | The dispatch-on-main test already reaches the `merge-base == HEAD` branch (on main the merge-base is HEAD itself), and a behind or merged branch takes the same code path. A second fixture would cover nothing new. |
