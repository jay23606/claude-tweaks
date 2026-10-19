# Open Items — Windows regression: 2 test file(s) newly failing after a39cd61fa (#3429)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | skill-load-report-cli.test.js:105,118 duplicate the combined win32/root skip expression inline in two tests; a shared const would keep them in step | fixed | commit 085da0e25 — build Common Step 3 simplify hoisted it into one test-local CHMOD_DENIAL_SKIP const (skipUnderRoot( text and ./helpers/root import kept) |
| 2 | build | Confirm both chmod permission tests in skill-load-report-cli.test.js report as skipped with 'win32: chmod does not deny reads', and the load-delta-cli REVIEW tests pass, on the next windows-latest run of windows-regression.yml (spec AC4 / Gotchas) | observation | skip expression evaluated to the stated reason for win32 at build time; live Windows run is post-merge |
