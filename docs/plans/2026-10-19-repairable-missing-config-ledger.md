# Open Items — Dispatch: repairable missing-config.yml classification + repair-then-continue branch in the two-call gate

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | first-call-artifact-check.js header comment claimed claim liveness/runId are facts computeAdoption keys on (it keys on run-state pr/dispatched + run content only) | fixed | Comment reworded to the real relationship — `729a9e544` |
| 2 | build | AC6.2 claim-absent sub-case supplies no gitRunner (harmless — returns before use) | accepted | Final whole-branch review triaged as fine to leave: the path returns before gitRunner is used |
| 3 | build | resolveFirstCallGate trimEnd() accepted `STATUS: DONE   ` — lenient vs the literal ^STATUS…$ contract | fixed | Leniency dropped; test now asserts `blocked` — `729a9e544` |
| 4 | build | resolveFirstCallGate reads the first OUTCOME: line anywhere in the reply — an echoed earlier OUTCOME line would misread | accepted | Brief-literal; final review triaged as fine to leave — a dispatched reply's OUTCOME line precedes any prose by the OUTPUT FORMAT contract |
| 5 | build | Task 2 tests use an appended require() rather than a top-of-file import | accepted | Kept existing test lines byte-identical (AC6); style-only, final review triaged as fine to leave |
| 6 | build | two-call-gate.md repair paragraph "One failed result is not routed to section 5." read ambiguously | fixed | Reworded to "The one exception: this failed result…" — `729a9e544` |
| 7 | build | two-call-gate.md local-merge → case 2 claim depended on the dispatched:true stamp without saying so | fixed | Qualified (case 2 with the stamp, else case 3; snapshot-else-precedence-chain) — `729a9e544` |
| 8 | build | dispatch-mechanical-enforcement.test.js assertRepairBranch's artifact<repair half is trivially true | accepted | Plan-mandated test body; the status-before-artifact half and the go-red control carry the ordering — final review triaged as fine to leave |
| 9 | build | Ruling: unset integration-model key in policy.yml now requires the pr-first PR evidence (never claim-only, never outright false); invalid stays false — cost if wrong: a local-merge project with no explicit key and a stray recorded, pushed PR could repair | observation | — |
| 10 | build | Ruling: resolveFirstCallGate kept as a tested code twin of two-call-gate.md §2's ordering, not runtime-wired (no CLI added — beyond spec scope) — cost if wrong: twin and executed prose gate can drift, guarded only by AC9.2's prose pin | observation | — |
| 11 | build | Ruling: final-review items 1, 2, 6 fixed; remaining deferred minors left per reviewer triage | observation | — |
| 12 | build | Parked re-review minor: comment/prose overstate "recorded pr → case 3" (computeAdoption case 3 also needs hasOtherContent; with none it lands in case 2) — Ruling: code stands, a call 1 that ran /flow always leaves decisions.md content | observation | — |
| 13 | build | Corrected premise: sequential-execution.md's stale /claude-tweaks:flow {target} wrap-up teardown reference was already fixed on main by #3367 — no edit needed | observation | — |
