# Open Items — /feedback: check a quoted Bash refusal against plugin/bin before attributing it to pre-tool-use.js

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SKILL.md Step 1 Bash-refusal attribution paragraph is one dense ~250-word block — could split into lead + bullets (SDD task review minor) | fixed | Split into a lead sentence plus bullets at wrap-up |
| 2 | build | Bash-refusal attribution match branch covers only a `claude-tweaks:`-prefixed deny; a grep hit on a non-prefixed string under plugin/bin is unspecified (SDD task review minor) | fixed | Added a bullet: read a non-prefixed hit; a line that only quotes or recognizes the refusal counts as no match; conformance pin added |
| 3 | build | Conformance test's `/harness/i` assertion is weak on its own (compensated by neighbouring scratch-worktree / never…hook defect assertions) (SDD task review minor) | fixed | Assertion now pins the literal `Claude Code harness worktree guard` |
