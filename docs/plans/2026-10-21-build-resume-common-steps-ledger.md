# Open Items — Resumed /build with a valid plan skips Common Steps 1.5-1.7 unconditionally (#3666)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | Re-review observation: the 1.6 resume skip's `git log -1` check sees only committed changes, so an uncommitted plan/spec edit would not count as "changed after" the recorded review (`plugin/skills/build/SKILL.md` Spec Step 2) | accepted | plan-review.md's amendment step commits spec and plan together, and a dirty worktree fails the Adopt-or-create clean-tree check before a resume reaches Spec Step 2 — an uncommitted edit cannot reach this decision unnoticed |
| 2 | build | Re-review observation: the 1.6 resume bullet does not spell out how to compare a `decisions.md` entry's time with a commit's time | accepted | the entry carries its time and the run-dir name carries its date (`_shared/auto-decision-log.md` schema); the rule errs toward re-running the review when unsure, which is the safe direction |
