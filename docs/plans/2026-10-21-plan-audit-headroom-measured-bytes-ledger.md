# Open Items — Measure plan-audit headroom the way the Read rail does — marker-stripped, CRLF-normalized bytes

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD task review minor: `headroomCheck` drops `measuredBytes`' `markerError` — a malformed `when:` marker falls back to CRLF-normalized unstripped bytes with no surfaced error (`plugin/bin/lib/plan-audit/checks.js` headroomCheck) | accepted | Parity with the rail: `rail.js`'s `skillFileRailViolations` drops `markerError` the same way, and the fallback over-counts (never misses a breach); spec #3459 fixes `headroomCheck`'s return shape (no new keys). Malformed markers are caught by `tests/compose-markers-conformance.test.js`, not the byte rail. |
