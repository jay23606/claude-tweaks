# Open Items — Close dead runs in report-only mode, show only orphaned runs in the SessionStart banner, and archive a session's own ad hoc run at SessionEnd (#3977)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Maintainer reviews this repository's report-only output (`node plugin/bin/hooks.js reconcile --dry-run --json --checks archive`, recorded in the PR body) and agrees every formal-run `would close` line names an abandoned run — Deliverable 8's pass criterion; it blocks the enabling record #3978, not this one (reason-not-auto: requires-human-judgment) | acknowledged | Staged as a record proposal at staged/ledger-record-confirm-report-only-disposition.md (auto-acknowledged under `unattended` autonomy — resolves at the Review Console's Queue writes section) |
| 2 | wrap-up | Reflect (Friction lens): 6 `wd-guard-refusal` compound-Bash denials across build/review/wrap-up, same shapes each time (heredoc `node -e`, chained `&&` assignments, a `for` loop) | deferred | Pattern observation, Destination: decline — reason stated in staged/reflect-1.md; resolves at the Review Console's Skill updates section |
