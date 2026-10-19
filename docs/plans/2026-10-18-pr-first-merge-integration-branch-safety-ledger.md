# Open Items — #3347 pr-first-merge: forbid rewriting the integration branch and stop eval-composing merge messages

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/scope | Four local-merge fences (_shared/local-merge-auto-finish.md, wrap-up/auto-merge-short-circuit.md, dispatch/settle-and-merge.md, flow/worktree-merge.md) still eval compose-subject --shell output into git merge -m — same shell-interpretation fragility #3347 removed from the pr-first gh pr merge fences; out of #3347 AC2 scope (gh pr merge only). Candidate follow-up: migrate to a file-based -F message via compose-subject file mode. | open | — |
| 2 | build | SDD ruling: T4 froze pre-#3347 item 1 from git show 294eac138 (not post-T2 copy) so the go-red proves the pre-change text misroutes | observation | Ruling recorded by SDD controller |
| 3 | build | SDD ruling: implementers on Fast (haiku) per size:low override, reviewers on Standard (sonnet) | observation | Ruling recorded by SDD controller |
| 4 | build | Orphan title file possible on compose-subject exit 3 when body write fails after title write — merge fences stop on any non-zero exit | deferred | Final review triage: leave (session-scoped, overwritten; stale files now cleared pre-compose in 48164051e) |
| 5 | build | compose-subject failWrite test covers only first-write failure, not body-after-title | deferred | Final review triage: leave (same code path) |
| 6 | build | SDD ruling: folded docs/plugin-structure.md compose-subject CLI line update into Task 2 | observation | Ruling recorded by SDD controller |
| 7 | build | eval-merge sweep only sees a fence holding both gh pr merge and the eval marker — a split across sibling fences would pass | deferred | Final review triage: leave (quoted $SUBJECT_* marker catches the realistic split) |
| 8 | build | pr-first degrade fence reuses the opening fence's paths; a cross-session degrade would lack them | deferred | Final review triage: leave (degrade runs in the same session) |
| 9 | build | SDD ruling: folded Step 3 path-paste wording + two journey-doc eval-form updates into Task 3 | observation | Ruling recorded by SDD controller |
| 10 | build | /rewrite/ assertion in tests/pr-first-merge.test.js passes on the heading word alone | deferred | Final review triage: leave (five other tokens carry it; fold /Never force-push/ if touched again) |
| 11 | build | No-rewrite go-red fails only at heading-exists, not at a missing token | deferred | Final review triage: leave |
| 12 | build | No-rewrite rule's DONE_WITH_CONCERNS wording assumes a dispatch context | deferred | Final review triage: leave (spec-mandated wording) |
| 13 | build | Journey 2251 Step 4 "same merge fence as step 1" ambiguous between the two forms | deferred | Final review triage: leave (docs only) |
| 14 | build | classifyStderr backtick scan includes item 1's fenced block — over-approximates item 1; unsound for future item 2-4 routing tests | deferred | Final review triage: leave (go-red still discriminates) |
| 15 | build | Backticked mergeStateStatus/DIRTY in item 1 counted as classifier signatures | deferred | Resolved in 48164051e (un-backticked) |
| 16 | build | DIRTY re-check sits mid-signature parenthetical; wait/merge-when-green sub-bullet does not restate it | deferred | Final review triage: leave (precedes both sub-bullets in reading order) |
