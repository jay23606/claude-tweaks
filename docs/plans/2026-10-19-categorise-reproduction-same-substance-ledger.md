# Open Items — review: categorise-reproduction splits a reproduced finding when the two agents word it differently (#3326)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD ruling — #3028 pair pinned confirmed with no severityContested flag (low and medium share one severity bucket), replacing the plan's severityContested===true: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 2 | build | #3326 test loops over three pairs in one test, so a regression reports only the first failing pair (one subtest per pair would show all three) | fixed | Review: split into one test per pair (commit follows); reverting SUBSTANCE_SIMILARITY_MIN to 0.4 now reports all three pairs red |
| 3 | build | #3028 assertion pins severityContested === undefined (absence) — breaks if production later sets the flag to false | deferred | SDD task review Minor — matches the existing same-bucket test's pattern |
