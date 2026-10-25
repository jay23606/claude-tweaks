# Open Items — #4314 Shipped-candidate detector reads a PR's own filed follow-ups as shipped by it

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | record-dependencies.js #4314 comment line is ~150 chars vs ~75-char wrap of neighbours (plan-mandated text, cosmetic) | deferred | Origin: SDD Task 1 review (minor). File: plugin/bin/lib/issues/record-dependencies.js. Revisit: next edit of the buildLinkedPRQuery comment block. Final review: fine as is. |
| 2 | build | unparseable-createdAt and record-without-createdAt tests pin unchanged behavior (non-discriminating by design, per brief) | deferred | Origin: SDD Task 2 review (minor). File: tests/bin-lib/issues/shipped-candidate.test.js. Revisit: if the classifyShipped null/NaN guards change. Final review: fine as is — the unparseable test does catch a NaN-drop mutation. |
| 3 | build | SKILL.md False-positive posture — #4314 sentence preceded "That exclusion costs one human approval", misattributing the cost | fixed | ac6b46b82 — sentence moved after the exclusions.js sentence (final-review Important) |
| 4 | build | SKILL.md new #4314 sentence was one unwrapped long line | fixed | ac6b46b82 — paragraph re-wrapped (one residual tail line, see #6) |
| 5 | build | SDD ruling — accepted the 3-line re-wrap of the #4314 queue-pull comment over the plan's 2-line split (plan split broke the pinned phrase): ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 6 | build | Final review parked — SKILL.md False-positive paragraph keeps one ~125-col line (unchanged tail) after the fix-wave re-wrap | observation | Cosmetic only; no reader or test pin affected; no second fix wave per SDD |
| 7 | build/skill | skill-prose-conformance-tests (enrichment): a single-line regex pin over prose inside a hard-wrapped `#`-comment or paragraph fails when the authored wrap splits the phrase — plans should keep a pinned phrase on one line (#4314 Task 3 hit this) | observation | Seeded for wrap-up's Skills curation row. Skills row judged it: already covered by skill-prose-conformance-tests' hard-wrap and whitespace-collapse bullets (IL-66); no update. |
| 8 | wrap-up | pr — PR #4323 — this run's own pr-first PR; disposition is Phase 4's merge decision | observation | Own PR per residue sweep (ownPr); decided by Phase 4 |
| 9 | wrap-up | suite — residue probe skipped via --no-suite | observation | Suite state taken from the runner pass stamp instead: full scope at HEAD ec8c2335f, 17758 tests / 17756 pass / 0 fail |
