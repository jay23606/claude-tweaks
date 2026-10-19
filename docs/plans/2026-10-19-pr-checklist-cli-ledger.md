# Open Items — Add a bin CLI for the PR phase-checklist flip at every pr-first phase exit (#3263)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD pre-flight Ruling: Task 3's MCP path resolves its body temp file through bin/session-tmp-resolve.js, never a literal /tmp/pr-checklist- path (keeps AC3.2's assertion true) | observation | Ruling recorded during SDD pre-flight scan |
| 2 | build | setPhaseRow/firstLineRunId coerce a non-string body to '' — CLI should reject a missing gh body first | fixed | pr-checklist.js exits 5 on a non-string gh body (1c3950f96), test pinned |
| 3 | build | Untested documented transform behaviors: mixed checked/unchecked duplicate rows, --remove on a checked row, unmatched start-marker fallback, row before start marker, uppercase [X] | deferred | --remove on a checked row now tested and fixed (30202e23a); the other four remain untested — below the materiality floor, coverage polish |
| 4 | build | Unreadable --summary-file detected only after no-pr/gh-absent exits (plan-mandated order) — those paths exit 0 not 2 | deferred | Caller never passes --summary-file without a PR; final review: ok to defer |
| 5 | build | --help combined with an invalid flag exits 2 instead of printing usage | deferred | Final review: ok to defer |
| 6 | build | pr-checklist.js transforms run outside try/catch — a theoretical throw exits 1, outside the documented vocabulary | deferred | Final review: theoretical (phase validated upfront, parsers don't throw) |
| 7 | build | restored-line none/some wording keyed on restored.length === 3 couples to repairPrBody's marker count; 'some' branch untested | deferred | Final review: semantics correct today |
| 8 | build | Edited M1 ordering pin (Refresh precedes mcp__github__update_pull_request) cannot go red on the old text — forward-only guard | deferred | Final review: ok to defer |
| 9 | build | Dropped the prose sentence on '; '-joined sibling-spec Revised-during-build notes surviving (behavior lives in reviseSpecSummary) for the byte budget | deferred | Behavior pinned in pr-body.js tests; final review: ok to defer |
| 10 | build | docs/journeys/read-an-accurate-spec-summary-after-a-premise-reversal-3050.md:27-28 describes the old temp-file order | fixed | Steps 2 and 4 rewritten for the CLI path in Common Step 6 (journeys) |
| 11 | build | Task 3 Ruling: pre-merge step 1 re-runs the CLI once per exited phase (no-op when landed), names --phase polish --remove; Best-effort no longer claims a cross-phase re-flip | observation | Ruling recorded during Task 3 fix round 1 (534017f45) |
| 12 | build | Go-red control PRE_3263 only proves the /tmp/pr-checklist- assertion can fail; the gh pr edit / Locate-the-checklist-span assertions are never shown red one at a time | deferred | Final review: ok to defer (PRE_3263 contains all three strings) |
| 13 | build | MCP path lost the best-effort handling for a non-zero revise-pr-summary.js exit | fixed | Restored "non-zero exit → warn, write checklist-only" (30202e23a) |
| 14 | build | $PR_CHECKLIST_BODY used without its eval session-tmp-resolve form | fixed | Replaced with a {body-file} placeholder (30202e23a) |
| 15 | build | Pinned "A single-record run never reaches this branch" reads as if a skipped phase's row removal can't fail | deferred | Per-phase --remove re-run now covers it; sentence is test-pinned; final review: ok to defer |
| 16 | build | Final-review Ruling: #7 (two PR writes per phase exit on an uncovered reversal) and #8 (no --repo on the gh calls) not fixed — plan-sanctioned / equivalent, wrong-repo read fails safe at exit 4 | observation | Ruling recorded after the final whole-branch review |
| 17 | build/skill | gh-api-module-pattern extension: pr-checklist.js widens the injectable `gh(args, input)` seam with stdin input (`gh pr edit --body-file -`), so the CLI writes a PR body with no temp file — worth a line in that skill's runner-seam section | observation | Skill observation from Common Step 4.5 |
