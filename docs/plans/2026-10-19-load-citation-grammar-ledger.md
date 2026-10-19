# Open Items — Extend the load model citation grammar with plugin-root- and skills-dir-relative tokens

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD ruling — Task 1 Step 5 (AC measurement) run by the controller, not the implementer: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 2 | build | SDD ruling — accept implementer's climb-out test fixture change (plan's exists:()=>true fixture was self-contradictory): ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
| 3 | build | minor: no test for a `{skill}/` token with an embedded `..` (e.g. `wrap-up/../build/SKILL.md`) | accepted | Below the materiality floor: `withinRoot` already filters every (e) candidate, and the climb-out test (`tests/bin-lib/skill-audit/load.test.js`) pins that filter on the (e) path. |
| 5 | build | AC residue: after rule (e), 469 unresolved pairs remain within plugin:flow's base-closure files. 110 are placeholders/globs, 95 are outside the plugin (docs/, CLAUDE.md), 3 are `skills/` tokens whose target is missing, and 261 are bare names or sub-paths. Some of those 261 name real files cited relative to a skill other than the citing one (for example `modes/review.md` → design-wrapper, `reference/*.md`). The "genuinely names nothing" claim therefore holds only for the first three classes. Candidate follow-up record: a further grammar rule or citation-form fixes. | open | — |
| 4 | build | minor: reviewer flagged controller scratch `plugin/bin/lib/skill-audit/load.js.base-tmp.js` | observation | Untracked measurement scratch, deleted before review completed; never committed. |
