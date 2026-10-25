# Open Items — Move close-out's update-marker parsing and validation out of prose into a tested module

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | appendUpdate/resolvePendingCommit do not validate input sha/method (CLI validates; bad value reads back unknown) | deferred | |
| 2 | build | SDD ruling — fold the docs/plugin-structure.md line-66 lib/dispatch entry for close-out-marker.js into Task 2 (which already edits that doc) — the mod...: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | |
| 3 | build | SDD ruling — fold a prose-code twin pin (module EXPLANATION === close-out-update.md template paragraph) into Task 3's conformance-test edit — Task 3 o...: ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | |
| 4 | build | SDD ruling — Task 2 pre-review — CLI rejects \r/\n in any flag value (exit 2) — a newline in a conflicted path would corrupt the marker body (blank li...: ratify or reverse at the Review Console (staged/sdd-ruling-3.md) | open | |
| 5 | build | SDD ruling — Task 2 pre-review — `written` echoes the --out path, not `true` — sanctioned-writer "written path echoed" convention and plan intent — co...: ratify or reverse at the Review Console (staged/sdd-ruling-4.md) | open | |
| 6 | build | close-out-marker.js:172-179 re-implements findRunComments' candidate filter / commentList unwrap to fetch the body — drift risk if the trust rule changes in find-run-comment.js | deferred | |
| 7 | build | SHA_RE duplicated from the Task 1 module (not exported); a conflicted path starting with `--` cannot be passed (find-run-comment convention) | deferred | |
| 8 | build | no test for a trusted marker comment lacking an id (write treats as no marker) | deferred | |
| 9 | build | SDD ruling — Task 3 plan-mandated Important ("composed only by close-out-marker.js, never by hand" overclaims — Clear and nothing-landed restore still...: ratify or reverse at the Review Console (staged/sdd-ruling-5.md) | open | |
| 10 | build | no pin ties the prose's write/resolve-pending flag names to the CLI's VERBS beyond the --comments-file prefix | deferred | |
| 11 | build | Clear and nothing-landed restore still hand-edit the body's second line — a `clear` verb would remove the hand-edit (out-of-scope observation) | deferred | |
| 12 | build | SDD ruling — final Important 1 — add `write --conflicted-files-file <path>` (Write-tool file, one path per line; commas/empty → exit 1; mutually exclu...: ratify or reverse at the Review Console (staged/sdd-ruling-6.md) | open | |
| 13 | build | SDD ruling — final Important 2 — add `read --body-out <path>` saving the trusted comment's raw body; the prior-pending Read saves it, the nothing-land...: ratify or reverse at the Review Console (staged/sdd-ruling-7.md) | open | |
| 14 | build | SDD ruling — fold all 5 final-review minors (trailing-space test, read `ids`, twin pin key order, MARKER_LINE import, write trust test) into the same ...: ratify or reverse at the Review Console (staged/sdd-ruling-8.md) | open | |
| 15 | build | a conflicted path containing a comma makes `write` exit 1 (candidate stops `marker not written`) — neither prose nor CLI error names `--conflicted-files unknown` as the escape hatch | deferred | |
| 16 | build | a conflicted path literally named `none`/`unknown`, or ending in a space (trimEnd), is ambiguous/altered in the marker format — pre-existing format limit | deferred | |
| 17 | build | step 3's pre-existing `git -C {wt} add {paths}` pastes git-derived conflicted paths into a shell argument (same `$`-expansion exposure as the fixed write call) — pre-existing, outside this diff, follow-up record candidate | deferred | |
