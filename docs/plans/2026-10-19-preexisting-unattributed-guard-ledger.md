# Open Items — matchPreExisting adjudicates a run as covered while failures no named file accounts for remain (#3481)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | implementer runs only the focused suites, never the full npm test — /build Common Step 5 runs the full suite centrally and produces the pass stamp — if wrong: a cross-suite break surfaces one step later, at Common Step 5 | observation | — |
| 2 | build | `unattributedFailureCount` is called without `cwd` in the preExisting block (and the existing flaky retryHook), so frame relativization depends on `process.cwd()` | deferred | — |
