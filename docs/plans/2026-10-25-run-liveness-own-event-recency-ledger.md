# Open Items — #4154 run-liveness/probes.js requires reconcile/archive-merged for a 12-line reader: move ownEventRecency down

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | archive-merged.js:22 destructures readEventLines from ../hooks/context, now unused after the move | fixed | Dropped by /build Common Step 3 simplify |
| 2 | build | tests/hooks-context.test.js:651 comment still names archive-merged.js as ownEventRecency's home (test files frozen by AC2.1) | fixed | Comment-only edit in tests/hooks-context.test.js (not one of AC2's two named test files) by /review |
| 3 | build | probes.js moved ownEventRecency header still says "Only the caller below needs to tell those apart" — no caller below it in probes.js now | fixed | Header reworded to name both readable-consuming callers by /build Common Step 3 simplify |
