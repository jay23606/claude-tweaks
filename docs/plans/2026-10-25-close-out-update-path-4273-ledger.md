# Open Items — dispatch close-out: offer an update-from-main path for a DIRTY or BEHIND PR instead of a flag-only stop

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Pre-flight branch-divergence check: origin/main was ahead of the adopted worktree's branch at run start | fixed | Post-creation catch-up fast-forwarded the branch from 43c11df0e to 8e864ba5f (origin/main) before any build commit |
