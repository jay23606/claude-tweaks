# Open Items — #3442 friction-events.js reads decisions.md local times as UTC

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | no non-UTC test takes computeClaimBoundary's rollover branch (mint.getDate()+1) — Test B stays on the same local day; add e.g. Copenhagen mint 21:50Z (23:50 local) + claim 00:05:00 local | fixed | 333dd1290 — added the Copenhagen 23:50-mint / 00:05-claim test; reverting the rollover line turns it red |
| 2 | build | withTz relies on runtime process.env.TZ, reliable on POSIX Node only (CI ubuntu-only today) | deferred | Routed below the materiality floor (size/risk/priority low; Defer-reason: blocked-external — verifying needs a Windows host) to the digest: https://github.com/thn-inc/claude-tweaks/issues/1426#issuecomment-6277080268. Files: tests/friction-events-cli.test.js. Revisit if CI gains a Windows runner |
| 3 | build | SDD ruling — wrap existing #2989 tests in withTz('UTC', …), fixtures/assertions unchanged: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | |
| 4 | wrap-up | pr — PR #3652 — this run's own pr-first PR; disposition is Phase 4's merge decision | observation | |
| 5 | wrap-up | suite — residue probe ran with --no-suite (skipped via --no-suite); suite state taken from the runner stamp at ca032be1d (13405 tests, 0 fail) | observation | |
