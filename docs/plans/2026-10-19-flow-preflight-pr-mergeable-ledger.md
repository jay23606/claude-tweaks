# Open Items — flow-preflight's pr probe omits mergeable state (#3014)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | Task 1 minor: PR_CONFLICT_NOTE fill used a string replacement — a `$&`/`$'` in a branch name would expand | fixed | 787470231 (function replacers + `$&` test) |
| 2 | build | Task 1 minor: preflight.test.js `typeof extra.mergeable` guard is roundabout but correct | deferred | Origin: Task 1 review; file tests/bin-lib/flow/preflight.test.js; revisit when that test is next edited. Cosmetic, below materiality floor |
| 3 | build | Ruling: register the new adopted-run HARD-GATE in `_shared/auto-mode-contract.md`'s HARD-GATE / BLOCKED / STOP row (spec mandates the stop; every mid-flow auto stop must be enumerated) | observation | Applied in 114431c29 |
| 4 | build | Ruling: log an AUTO entry on the abort-and-stop path, matching git-discipline's abort path | observation | Applied in 114431c29 |
| 5 | build | Task 2 minor: new steps-and-gates paragraph silent on catch-up step-1 dirty-tree and fetch/push degrade cases under the new stop semantics (inherited fail-open by citation) | deferred | Origin: Task 2 review; file plugin/skills/flow/steps-and-gates.md; revisit if a dirty-tree/fetch-failure adoption is observed — whole-branch review judged no action needed before merge |
| 6 | build | Task 2 minor: `{worktree-path}` placeholder undefined in steps-and-gates.md (resolves through the git-discipline citation) | deferred | Origin: Task 2 review; file plugin/skills/flow/steps-and-gates.md; revisit when the adoption section is next restructured |
| 7 | build | Task 2 minor: duplicated "run /claude-tweaks:test" instruction vs the file's Auto-insert `test` rule | fixed | 787470231 (now cites the Auto-insert rule) |
| 8 | build | Task 2 minor: new paragraph is one ~2.1k-char line (matches neighbors) | deferred | Origin: Task 2 review; file plugin/skills/flow/steps-and-gates.md; style-only, matches the section's existing one-line paragraphs |
| 9 | build | Task 2 minor: abort-path AUTO log entry had no `--text` | fixed | 787470231 |
| 10 | build | Ruling: fix final-review Important (conflictNote only for OPEN PRs) plus Minors 2-4, 6 and the new-code half of Minor 5 in one fix wave | observation | Applied in 787470231; re-review clean |
| 11 | build | Ruling: pre-existing `ADOPTION_NOTES` string-replacement fills not changed (outside this record, surgical-changes rule) | observation | Below materiality floor — a branch/path containing `$&` renders oddly in an adoption note |
| 12 | build | Ruling: dispatch Settle classifies the new adopted-run conflict stop as `failed:{gate}` vs `pending-review` for the same root cause on the merge path — out of scope | deferred | Staged as a follow-up work-record proposal at {run-dir}/staged/followup-1.md for the Review Console |
| 13 | build | Final-review minor: a `polish,wrap-up`-only resume would not trigger the Auto-insert `test` rule the prose cites for re-verifying a caught-up HEAD | deferred | Origin: fix-wave re-review; file plugin/skills/flow/steps-and-gates.md; revisit if a polish,wrap-up-only resume after a catch-up is observed (dispatch's second call always includes review) |
