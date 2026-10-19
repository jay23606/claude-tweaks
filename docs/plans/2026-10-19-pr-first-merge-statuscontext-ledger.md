# Open Items — Normalize StatusContext entries in the pr-first merge gate rollup read

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | implementer on haiku (Fast), even though SDD's model guidance prefers a mid-tier model for prose-described tests — the /claude-tweaks:build override maps header size:low to Fast — cost if wrong: one extra fix round, escalated per the loop | observation | SDD pre-flight ruling; task review came back clean on the first pass |
| 2 | build | go-red control assert.throws has no message validator — any thrown error satisfies it (tests/pr-check-gate-conformance.test.js:121) | open | — |
| 3 | build | 'any other unfinished state → pending' clause unpinned beyond PENDING/EXPECTED (tests/pr-check-gate-conformance.test.js:102-109) | accepted | The prose names no state other than PENDING and EXPECTED, so there is no further named state to pin. normalizeEntry's catch-all pending branch is code and is covered by tests/bin-lib/pr-checks/classify.test.js |
| 4 | build | classify.js header runs StatusContext sentence into headRuns sentence in one item; line 12 long (classify.js:9-12) | fixed | build Common Step 3 simplify split the two notes into separate bullets (commit after 5099b384c) |
| 5 | build/scope | Follow-up, outside this record's Step 2.5 scope. `_shared/pr-first-merge.md` Step 3's post-merge report (item 6, `state: MERGED` bullet) reads `statusCheckRollup` entries literally ("All entries `COMPLETED`+`SUCCESS`… any entry still non-`COMPLETED`"). A merged PR carrying a StatusContext entry would therefore be reported as "had not concluded at merge time". It needs the same StatusContext normalization the Step 2.5 paragraph now states | open | — |
