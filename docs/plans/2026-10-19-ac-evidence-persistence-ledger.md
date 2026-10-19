# Open Items — build: an AC met only by a scratch check leaves no run-dir artifact for /dispatch's second call (#3079)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | flow | Step 2.5 pre-flight branch-divergence-check: origin/main was 1 commit ahead of the worktree branch at run start | fixed | Post-creation catch-up fast-forwarded the worktree branch 90de4e05e → 36c1166e3 (origin/main) before any build commit |
