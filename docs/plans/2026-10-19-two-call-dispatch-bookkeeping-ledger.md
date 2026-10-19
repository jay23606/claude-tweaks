# Open Items — #2912: Two-call /flow dispatch can leave the run with no materialize commit and no draft PR

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | Ruling: integration-model resolution in verify-run-bookends.js / first-call-artifact-check.js dropped — open record #3350 owns it with a different design; until it ships the PR bookend reports n/a on real runs | observation | SDD ruling; cross-ref comment posted on #3350 |
| 2 | build | Ruling: no new capture filed for the integration-model pin — #3350 already is that record | observation | SDD ruling |
| 3 | build | gitSucceeds collapsed a cat-file timeout into not-committed rather than undetermined | fixed | resolved in final fix wave b5aba89fc (gitProbe returns null) |
| 4 | build | remedy strings carry literal placeholders (<worktree>, {git, contents-api or mcp}) | fixed | resolved by Task 3 ruling (first-call insert says to substitute placeholders) |
| 5 | build | Ruling: first-call insert gains "(substituting its <...> and {...} placeholders)" | observation | SDD ruling |
| 6 | build | docs/plugin-structure.md documented missing[] without remedy | fixed | resolved in final fix wave b5aba89fc |
| 7 | build | Ruling: AC2.1 preflight test is a pin (passes before and after), not regression coverage — accepted per plan | observation | SDD ruling |
| 8 | build | Fixes #2912 in PR body while AC1's run-state.json.pr verification clause depends on #3350 — decide Fixes vs deferred-closure (Refs) before merge | fixed | decided at wrap-up: keep Fixes #2912. The draft PR is opened by /build on pr-first runs (this run's PR #3570 is the evidence); only the bookend check's coverage of it waits on #3350, an existing open ready record, so closing #2912 leaves nothing untracked |
| 9 | build | claim-targets.md:221 and the first-call insert state exit-1 handling only; exit 2 (malformed invocation) has no stated handling | fixed | exit-2 clause added to both sites at wrap-up |
| 10 | build | claimRemedy passes --run-id basename(runDir), which is spec-{N} for a per-spec run dir (pre-existing shape) | observation | mirrors the pre-existing claim check's `runId === basename(runDir)` in the same function; reachable only when a spec-{N} dir is passed, which dispatch never does (it passes the minted dir); no change |
| 11 | review/hindsight | hasClaimLogFor duplicated hasCanonicalClaimLogFor's regex in claim-log.js | fixed | hasClaimLogFor now calls hasCanonicalClaimLogFor; claim-log/verify-run-bookends/preflight/dispatch suites 91/91 |
| 12 | review/hindsight | first-call-artifact-check.js (dispatcher-side backstop) does not check the canonical Step 2.8 claim line; the new claim-log bookend is a call-1 self-check only | deferred | staged/reflect-1.md (tangential backlog candidate, Queue writes at the Review Console) |
