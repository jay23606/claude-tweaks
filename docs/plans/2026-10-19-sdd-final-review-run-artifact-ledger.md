# Open Items — Route build's SDD final-review capture through write-run-artifact.js so a worktree session can write it

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD minor (Task 1): cli.test.js has no CLI-layer exit-2 assertion for `--name ../sdd-final-review.md` | observation | Final whole-branch review: acceptable-as-is — the CLI routes through the same `isArtifactName` (`write-run-artifact.js:67`), the lib test covers traversal forms, and the existing "non-allowlisted --name exits 2" CLI test covers the exit path. |
| 2 | build | SDD minor (Task 2): live-probe fixture's fake `gitdir:` pointer targets a nonexistent `.git/worktrees` dir | observation | Final whole-branch review: acceptable-as-is — deliberately shared with the #496 suite's fixture; if the writer ever validates the pointer both suites fail loudly together. |
