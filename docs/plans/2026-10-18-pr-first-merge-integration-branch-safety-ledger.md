# Open Items — #3347 pr-first-merge: forbid rewriting the integration branch and stop eval-composing merge messages

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/scope | Four local-merge fences (_shared/local-merge-auto-finish.md, wrap-up/auto-merge-short-circuit.md, dispatch/settle-and-merge.md, flow/worktree-merge.md) still eval compose-subject --shell output into git merge -m — same shell-interpretation fragility #3347 removed from the pr-first gh pr merge fences; out of #3347 AC2 scope (gh pr merge only). Candidate follow-up: migrate to a file-based -F message via compose-subject file mode. | open | — |
