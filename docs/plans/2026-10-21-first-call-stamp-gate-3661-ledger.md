# Open Items — dispatch's first-call artifact gate never reads verify.js --stamp-status (#3661)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD Task 1 minor: `checkFirstCallStamp` edge inputs (array/string stamp read, empty-string worktree) route correctly but are not asserted | accepted | Routing verified by the task reviewer's code read of the reason ladder in `plugin/bin/lib/dispatch/first-call-artifact-check.js`; per-input assertions are test polish below the materiality floor. The `reportPath: null` case was added in 991016f42. |
| 2 | build | SDD Task 1 minor: `defaultStampStatus` spawn path (the load-bearing `cwd: worktree`) covered only by a manual probe | fixed | 991016f42: real-spawn temp-repo test asserting `status.head` is the recorded worktree's HEAD |
| 3 | build | SDD Task 2 minor: two-call-gate.md Repair branch opener "The one exception: this failed result" read across the stamp paragraph | fixed | 386fd2381: stamp paragraph moved after the Repair branch |
| 4 | build | SDD Task 2 minor: stamp paragraph silent on whether the stamp read runs on the `missing-config` repair path | fixed | 386fd2381: trigger widened to every call-2 dispatch, mirrored in sequential-execution.md |
| 5 | build | SDD Task 2 minor: redundant "log the line below" / "The logged line:" lead-ins | fixed | 386fd2381 |
| 6 | build | SDD parked (final review Minor 7): a corrupt `run-state.json` reads as `worktree-unrecorded` rather than unreadable | observation | Note posture, never a gate, so nothing breaks; the only cost is a misleading reason in one SKIP line. |
