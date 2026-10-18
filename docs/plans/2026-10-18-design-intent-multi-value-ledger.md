# Open Items — #3018: materialize.js: a comma-separated `Design-intent:` list is truncated to its first value

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | DESIGN_INTENT_VALUES aliased the shared POLICY_KEYS row array (exported, mutable) | fixed | ddeb2c20e — frozen copy in materialize-format.js |
| 2 | build | Space-separated legacy Design-intent lines (`quiet minimal`) now fail materialization instead of lifting the first token | accepted | Intended per AC (never silently drop); error names the whole token and points at /specify |
| 3 | build | Skill-side readers of header `design-intent:` unverified for single-token parsing | fixed | Final whole-branch review grep: no single-token reader (command-map, polish-execution, critics, review all tolerate a list) |
| 4 | build | materialize-format.js now requires policy-schema at load (resolve-ambiguity, release-note-repair, compose-record bins pay slight load cost) | accepted | Static table, negligible cost; single enum source is the spec's requirement |
| 5 | build | tests/materialize-design-intent.test.js asserts record + offending value but not the full stderr template (allowed-list / raw echo) | deferred | Origin: Task 2 review. Files: tests/materialize-design-intent.test.js. Trigger: next change to the materialize.js Design-intent message |
| 6 | build | Invalid Design-intent exits 1 before the missing-ceremony exit 2; no test pins a doubly-invalid record's exit code | deferred | Origin: Task 2 review. Files: plugin/bin/materialize.js. Trigger: next change to materialize.js gate ordering |
| 7 | build | Task 2 RED evidence produced against a scratch HEAD copy after implementing (process, not strict test-first) | observation | Red result still confirmed: invalid-value tests exit 0 against pre-change materialize.js |
| 8 | build | materialize.md "Lift them verbatim … design-intent: copies Design-intent:" contradicted the not-verbatim sentence | fixed | ddeb2c20e |
| 9 | build | materialize.md metadata code-fence example still shows single-value `Design-intent:` placeholder | deferred | Origin: Task 3 review + fix-wave re-review. Files: plugin/skills/flow/materialize.md (~line 121). Trigger: next edit to materialize.md lift-rule section; closing sentence already documents the list form |
| 10 | build | materialize.md gate bullet sits in the Passes/Fails list though it fires after shape-gate pass | accepted | ddeb2c20e reworded it as a driver-independent hard stop; placement is readable |
| 11 | build | Conformance tests 4-5 search the whole materialize.md, not the specific paragraph | deferred | Origin: Task 3 review. Files: tests/design-intent-multi-value-conformance.test.js. Trigger: next materialize.md restructure that moves these phrases |
| 12 | build | Follow-up: compose-record `validateShaped` (bin/lib/compose-record/compose.js:41) does not run the Design-intent check, so a ready record with `bold, none` or a free-text intent passes write-time and fails at /flow | open | — |
| 13 | build | Follow-up: liftMetadata's `indexOf('\n\n')` never matches a CRLF blank line, so a CRLF body's whole text is the metadata block; a later `Design-intent:`-shaped line can now trip the new gate | open | — |
| 14 | build | Ruling: Task 4 (full suite) not dispatched as a task — /build Common Step 5 runs the suite once and writes the pass stamp | observation | Cost if wrong: none — suite still runs before the test gate |
| 15 | build | Ruling: compose-record parity (row 12) and CRLF split (row 13) left out of #3018's scope | observation | Cost if wrong: invalid intents caught at /flow (loudly) rather than at write time; rare CRLF bodies may hit the gate |
