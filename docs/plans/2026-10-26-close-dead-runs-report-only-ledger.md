# Open Items — Close dead runs in report-only mode, show only orphaned runs in the SessionStart banner, and archive a session's own ad hoc run at SessionEnd (#3977)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Maintainer reviews this repository's report-only output (`node plugin/bin/hooks.js reconcile --dry-run --json --checks archive`, recorded in the PR body) and agrees every formal-run `would close` line names an abandoned run — Deliverable 8's pass criterion; it blocks the enabling record #3978, not this one (reason-not-auto: requires-human-judgment) | open | |
