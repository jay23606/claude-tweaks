# Open Items — Test suite overloads the dev machine (#3969)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Pre-flight branch-divergence: local main was 20 behind / 4 ahead of origin/main (the 4 are reconciler archive-rename commits). | observation | Worktree branched from origin/main so the local-only commits do not ride along; local main's divergence is the reconciler's to settle, not this record's. |
| 2 | build | SDD ruling — Add a playwrightCliMessage-level PATH test (spec AC over the brief): ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 3 | build | no findOnPath test for plain not-found / env.Path fallback / directory named playwright-cli (fold not-found into fix round 1) | deferred | — |
| 4 | build | detectVersionManager local const path shadows module-level path import (pre-existing name) | deferred | — |
| 5 | build | only cwd/node_modules/.bin checked, not ancestor dirs — narrower than npx in a monorepo subdirectory; advisory hint only | deferred | — |
| 6 | build | os.availableParallelism needs Node >=18.14; tools/ is maintainer-side and CI runs Node 20, so no fallback added | deferred | — |
| 7 | build | invalid CT_TEST_CONCURRENCY ignored silently while invalid CT_TEST_SUITE_SLOTS logs — asymmetry per brief | deferred | — |
| 8 | build | one test title joins two assertions | deferred | — |
| 9 | build | SDD ruling — fix via a per-slot reclaim mutex (slot-<i>.reclaim, wx) around re-read → re-verify stal...: ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
| 10 | build | two-call readFileSync/statSync mtime check in readHolder can pair content and mtime from different files (unparseable-lock path only) | deferred | — |
| 11 | build | wait/second-slot/release/sweep tests lack their own revert mutation (red run was 'not a function') | deferred | — |
| 12 | build | two simultaneous clearers of an old (>30s) reclaim mutex can both proceed — documented residual risk (needs a crashed reclaimer); worst case two concurrent suites once | deferred | — |
| 13 | build | wait message shows placeholder 'unknown' holder when the under-mutex re-read finds a live winner (first scan only) | deferred | — |
| 14 | build | SDD ruling — sweepStaleRoots scanning the whole real tmpdir costs 39-57s per run on a bloated tmpdir...: ratify or reverse at the Review Console (staged/sdd-ruling-3.md) | open | — |
| 15 | build | ~24-char longer tmpdir paths may hit macOS 104-char unix-socket limit — full-suite run will tell | deferred | — |
| 16 | build | a test that leaves a read-only dir would make rmSync of the run root fail and leave ct-testrun-* behind — full-suite AC check covers | deferred | — |
| 17 | build | real-terminal Ctrl-C delivers SIGINT to the child twice (group + forwarded); judged harmless, untested | deferred | — |
| 18 | build | SDD ruling — ONE fix wave covers Critical 1-2, Important 3-4, Minor 6 (forward SIGHUP as SIGTERM), 7...: ratify or reverse at the Review Console (staged/sdd-ruling-4.md) | open | — |
| 19 | build | Minor 10 slot location depends on os.tmpdir(); sessions with different TMPDIR would not share slots — Ruling: leave; this machine's sessions all resolve the same /var/folders tmpdir — cost if wrong: a differently-sandboxed session runs unthrottled, the pre-change behavior. | observation | — |
| 20 | build | Minor 12 SessionStart PATH detection differs from skills' npx --no-install detection — Ruling: leave as advisory; hint text only — cost if wrong: an occasional spurious install hint. | observation | — |
| 21 | build | SDD ruling — Switch run-tests.js to async spawn with signal forwarding (reverses plan: keep spawnSync): ratify or reverse at the Review Console (staged/sdd-ruling-5.md) | open | — |
