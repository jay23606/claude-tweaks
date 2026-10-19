# Open Items — check-sibling-sessions: `--record N` reads only local worktree locks, never the claims registry

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD ruling: default claim reader built on claim-store `createClaimReader` (wraps `readClaimBlob`, #3393 unresolved-slug guard) rather than a direct `readClaimBlob` call | observation | Ruling recorded in decisions.md; final review called it a sound refinement |
| 2 | build | tests/hooks-sibling-sessions.test.js import line `} =require` missing a space | fixed | a7bca0e65 |
| 3 | build | No test pins findLiveClaim's CLAUDE_CODE_SESSION_ID env fallback (every test injects sessionId) | accepted | Idiom copied verbatim from findConflictingSession (sibling-sessions.js), and the live probe exercised both env states (own session → no conflict; probe-other → live-claim line); final review: can defer |
| 4 | build | run-resume-freshness.md `locked` case is a second check-sibling-sessions consumer; a new-session resume now sees its own run's earlier claim | fixed | a7bca0e65 (own-run-id sentence added) |
| 5 | build | hooks.js [IL-107] handler comment framed the check as worktree/lock only | fixed | a7bca0e65 |
| 6 | build | sibling-session-check.md opening paragraph left as one long unwrapped line after the reframe | observation | Cosmetic; noted by the fix-wave re-review |
