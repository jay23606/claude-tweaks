# Open Items — #3503 Reconciler archives a run whose PR merged before all of its records were built

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD Task 1 minor: `unclosedRecords` has no direct test (ascending sort and `undefined` cases unpinned) | deferred | Origin: SDD Task 1 review (#3503). Files: tests/bin-lib/reconcile/archive-merged.test.js, plugin/bin/lib/reconcile/archive-merged.js. Trigger: next change to `unclosedRecords`; behaviour is covered indirectly through the `decideArchiveCore` tests. |
| 2 | build | SDD Task 1 minor: `unclosedRecords` does not dedupe `records` | accepted | Its only producer, `runRecordSet`, dedupes (1d304e1c2), so a duplicate id cannot reach it. |
| 3 | build | SDD Task 1 minor: string record ids would read as unclosed under strict number compare | fixed | `runRecordSet` emits integers and rejects any id failing `^[1-9]\d*$` (1d304e1c2, ddc300e4b). |
| 4 | build | SDD Task 2 minor: a manifest with empty `specs` falling through to the slug path is untested | deferred | Origin: SDD Task 2 review (#3503). Files: plugin/bin/lib/reconcile/archive-merged.js (`runRecordSet`), tests/bin-lib/reconcile/archive-merged.test.js. Trigger: next change to `runRecordSet`'s manifest branch. |
| 5 | build | SDD Task 2 minor: manifest-path dedupe in `runRecordSet` is untested (only slug-path dedupe is) | deferred | Origin: SDD Task 2 review (#3503). Files: same as #4. Trigger: same as #4. |
| 6 | build | SDD Task 2 minor: `RUN_RECORD_SLUG_RE`'s `spec-` alternative also matches a topic slug ending `-spec-N` | accepted | Fails closed (no wrong archive), rare. The issue-state fallback (0dd92b897) unblocks such a run once issue #N closes. |
| 7 | build | SDD ruling — non-integer manifest spec id makes `runRecordSet` return null (no record check): ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 8 | build | SDD Task 3 minor: the by-number console-resolved guard was untested | fixed | Test added in 0dd92b897 (final-review F4). |
| 9 | build | SDD Task 3 minor: the `index.js` `unclosed` passthrough had no pinning test | fixed | `reconcile()`-level test added in 0dd92b897 (final-review F5). |
| 10 | build | SDD Task 3 minor: a duplicated comment line in archive-merged.test.js | fixed | Removed in 0dd92b897. |
| 11 | build | SDD Task 3 minor: `archiveMergedRun` returns an explicit `unclosed: undefined` key on every skip | accepted | `skippedEntry` strips the key before anything leaves the module, so no consumer sees it. |
| 12 | build | SDD Task 3 minor: the ruling test pinned only `'abc'`, not `0x10`/`1e3` | fixed | Assertions added in 0dd92b897. |
| 13 | build | SDD ruling — issue-state fallback: a record whose issue is CLOSED counts as satisfied, and a probe failure fails closed: ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
| 14 | build | SDD ruling — empty `closingIssuesReferences` falls back to manifest pending/running status: ratify or reverse at the Review Console (staged/sdd-ruling-3.md) | open | — |
| 15 | build | SDD ruling — explicit `work-backend: local-files` disables the record check: ratify or reverse at the Review Console (staged/sdd-ruling-4.md) | open | — |
| 16 | build | SDD ruling — an unresolvable repo slug gets the distinct tracked reason `no-repo-slug`: ratify or reverse at the Review Console (staged/sdd-ruling-5.md) | open | — |
| 17 | build | SDD final-review minor: escalate-residue.js's escalation body omits the stuck reason and the unclosed record list | deferred | Origin: SDD final whole-branch review (#3503). Files: plugin/bin/lib/reconcile/escalate-residue.js. Trigger: next change to escalate-residue.js, or the first `merged-partial` escalation a human has to triage. |
