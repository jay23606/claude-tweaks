# Open Items — check-sibling-sessions: `--record N` reads only local worktree locks, never the claims registry

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD ruling: default claim reader built on claim-store `createClaimReader` (wraps `readClaimBlob`, #3393 unresolved-slug guard) rather than a direct `readClaimBlob` call | observation | Ruling recorded in decisions.md; final review called it a sound refinement |
| 2 | build | tests/hooks-sibling-sessions.test.js import line `} =require` missing a space | fixed | a7bca0e65 |
| 3 | build | No test pins findLiveClaim's CLAUDE_CODE_SESSION_ID env fallback (every test injects sessionId) | accepted | Idiom copied verbatim from findConflictingSession (sibling-sessions.js), and the live probe exercised both env states (own session → no conflict; probe-other → live-claim line); final review: can defer |
| 4 | build | run-resume-freshness.md `locked` case is a second check-sibling-sessions consumer; a new-session resume now sees its own run's earlier claim | fixed | a7bca0e65 (own-run-id sentence added) |
| 5 | build | hooks.js [IL-107] handler comment framed the check as worktree/lock only | fixed | a7bca0e65 |
| 6 | build | sibling-session-check.md opening paragraph left as one long unwrapped line after the reframe | observation | Cosmetic; noted by the fix-wave re-review |
| 7 | review | Lens 3b (both agents): claim-blob fields (runId/sessionId/host/claimedAt) printed unsanitized into an agent-read line — newline/escape forgery, `[object Object]` | fixed | e2811925d — `cleanClaimField` keeps strings only, neutralizes control chars, caps 200; test added |
| 8 | review | Lens 3f: AC1.1 test never asserted the reader receives claim 77 (reader ignored its argument) | fixed | e2811925d — reader records its argument, asserts `[77, 77]` (verified directly by reading the test) |
| 9 | review | Lens 3a: new sibling-session-check.md sentence restates the flow Step 2.8 correctness boundary also in docs/skill-graph.md | observation | Low-confidence, single agent; the sentence is spec deliverable 3 verbatim; staged to the Review Console |
| 10 | review | Lens 3a: findLiveClaim accepts `#N` but the pre-existing worktree half's tokenize does not match `#N` | observation | Low-confidence, single agent; spec AC requires `#77`; dispatch passes a bare number; staged to the Review Console |
| 11 | review | Lens 3f: AC2.1 packs eight fail-open cases into one test body | observation | Low-confidence, single agent; spec deliverable 4 specifies one fail-open test; staged to the Review Console |
| 12 | review | Lens 3b: a failed claim read prints the same no-conflict line as an absent claim | observation | Low-confidence, single agent; spec-mandated fail-open, documented in sibling-session-check.md; staged to the Review Console |
| 13 | wrap-up | Skills-row judge: a parseable shapeless blob (`{"error":"Not Found"}`) reads live with all-null fields | observation | Same classification flow Step 2.8's claim write uses (single definition of live, the spec's rationale); parse-signal-discipline item 10 already documents the hazard; not a regression |
