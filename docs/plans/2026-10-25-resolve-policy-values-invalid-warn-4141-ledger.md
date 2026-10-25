# Open Items — resolve-policy --values: warn on stderr when a requested key's value is invalid (#4141)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Step 2.5 pre-flight: origin/main was 3 commits ahead of the adopted worktree branch at run start | fixed | Post-creation catch-up fast-forwarded the branch to origin/main ff0fc67ab before any run commit |
| 2 | build | docs/journeys/resolve-a-policy-key.md --values steps/Red flags do not mention the new stderr warning (doc drift) | fixed | commit 938bac191 (Common Step 6 journey update, step 2 Should understand + Red flags + Origin) |
| 3 | build | No test for duplicate/aliased request keys, an invalid derived-default key (housekeeping-auto-merge), or JSON/--all modes staying silent — correct by construction | deferred | origin: SDD task review (minor); files: tests/resolve-policy-cli.test.js; trigger: revisit if the --values warning loop or onInvalid wiring changes |
| 4 | build | Reflowed resolve-policy.js header comment leaves a short line ("POLICY_KEYS entry, each decorated with") | fixed | commit 69d94a7b9 (Common Step 3 simplify rewrapped the paragraph) |
