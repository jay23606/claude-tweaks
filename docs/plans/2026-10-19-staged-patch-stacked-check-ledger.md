# Open Items — Check same-run staged patches stacked, not only alone, at staging time

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | stack-check.js `headerSources` scans the whole patch incl. the free-text preamble (a `rename from ../x` preamble line skips the patch; CRLF leaves `\r` in the source name) — scan from the first `diff --git` only | deferred | — |
| 2 | build | No committed stacked-check coverage for rename / new-file / deleted-file / binary patches | deferred | — |
| 3 | build | `isUnsafe` splits on `/` only (theoretical `..\` gap on a Windows checkout) | deferred | — |
| 4 | build | `rederive` refuses a target file created by an earlier patch with the generic "not a file in the worktree" reason | deferred | — |
| 5 | build | `rederive` branches untested: already-satisfied, unsafe/target-not-in-patches guards, multi-file partial conflict, rename/delete refusal, numstat/summary failure; the same-anchor rederive test asserts only `/conflict/` | deferred | — |
| 6 | build | `defaultGit`'s `GIT_CONFIG_GLOBAL=os.devNull` unverified on Windows (`\\.\nul`); needs git ≥ 2.32 (the `a/`/`b/` prefix pin is the fallback) | deferred | — |
| 7 | build | `git merge-file` exit 255 (a git error) is reported as `conflict in {path}` | deferred | — |
| 8 | build | cli.test.js shadow-refusal test asserts `existsSync` of a file never staged in the shadow (vacuous) and not empty stdout | deferred | — |
| 9 | build | CLI `rederiveReason` branches untested: rederive refusal, rederive throw, `--rederive-out` with a non-conflicting target, `conflictsWith === target` | deferred | — |
| 10 | build | docs/plugin-structure.md CLI line does not say exit 2 (target unapplicable) still prints the JSON line | deferred | — |
| 11 | build | staged-patch-contract go-red control trips only the heading assertion; the gate's `apply order` include matches the log template incidentally; "byte-wise" vs JS UTF-16 sort (ASCII names, no effect) | deferred | — |
| 12 | build | staged-patch-contract test pins token presence only — not the re-run-once bound or the re-anchor condition | deferred | — |
| 13 | build | console-resolve.js `checkPatchStack` realDeps wiring and its throw fail-closed branch have no test (deleting the wiring line would silently restore the per-patch verdict) | deferred | — |
| 14 | build | stack-check order-agreement test mirrors readSnapshot's filter/sort instead of calling it (would not catch readSnapshot drift) | deferred | — |
| 15 | build | Stacked-check STAGED conflict line names only the first conflict involving the target (the JSON `conflicts` array carries all) | deferred | — |
| 16 | build | SDD ruling — Task 2 may refactor Task 1's internals to share the stack walk, keeping `checkStack`'s exported shape: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 17 | build | SDD ruling — per-task implementers ran on haiku per /build's size:low directive, overriding SDD's mid-tier floor: ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
| 18 | build | SDD ruling — CLI maps any checkStack throw to exit 4; a rederive throw or out-file write failure keeps exit 1 with rederiveReason: ratify or reverse at the Review Console (staged/sdd-ruling-3.md) | open | — |
| 19 | build | SDD ruling — Task 4 fix round folded the re-run-bound Minor into the Important fix: ratify or reverse at the Review Console (staged/sdd-ruling-4.md) | open | — |
| 20 | build | SDD ruling — final-review I1 fixed console-side (stacked verdict in readSnapshot) rather than dropping re-derivation: ratify or reverse at the Review Console (staged/sdd-ruling-5.md) | open | — |
| 21 | build | SDD ruling — final fix wave also took M3/M5/T3/T2/M4; M6 deferred: ratify or reverse at the Review Console (staged/sdd-ruling-6.md) | open | — |
