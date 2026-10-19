# Open Items — #3442 friction-events.js reads decisions.md local times as UTC

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | no non-UTC test takes computeClaimBoundary's rollover branch (mint.getDate()+1) — Test B stays on the same local day; add e.g. Copenhagen mint 21:50Z (23:50 local) + claim 00:05:00 local | deferred | |
| 2 | build | withTz relies on runtime process.env.TZ, reliable on POSIX Node only (CI ubuntu-only today) | deferred | |
| 3 | build | SDD ruling — wrap existing #2989 tests in withTz('UTC', …), fixtures/assertions unchanged: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | |
