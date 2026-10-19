# Open Items — #3495: Resolve both sides of pre-tool-use isPolicyFile with fs.realpathSync.native

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | shadowPipelineRunDir (pre-tool-use.js ~680) now receives .native realTarget output — mis-cased paths now match pipelinesDir (stricter, fail-safe); no case-insensitive-volume test pins this tightening (final review: file as a follow-up record) | deferred | — |
| 2 | build | path-guard-conformance allowlist reason for lib/hooks/pre-tool-use.js hardcodes line numbers (429, 2015), will drift (matches the file's convention) | deferred | — |
| 3 | build | safeReal-based comparisons elsewhere in pre-tool-use.js (own-cwd containment ~554/567, E1 ~1736-2130) share the JS-form casing weakness — pre-existing, outside #3495 scope; route as a follow-up record | observation | Parked at final review — pre-existing, not introduced by #3495 |
| 4 | build | Ruling: realTarget's missing-leaf parent fallback also moved to canonicalRealpath (beyond the spec's literal wording) so both sides use one resolver — cost if wrong: one extra line of diff | observation | Ruling recorded during SDD pre-flight |
| 5 | build | Ruling: SKILL.md:14 stale realTarget JS-form prose fixed in-task (plan scoped only line 43) — cost if wrong: one extra doc hunk | observation | Ruling recorded during Task 1 fix round 1 |
| 6 | build | Ruling: final-review F2 (on-disk Policy.yml casing regression) fixed now via a regular-file-only leaf canonicalization in canonicalRepoPath — cost if wrong: extra code on the swap-protection path, guarded by existing swap tests | observation | Ruling recorded at final review |
