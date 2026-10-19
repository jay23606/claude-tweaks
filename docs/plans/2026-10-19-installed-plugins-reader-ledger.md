# Open Items — One reader for installed_plugins.json (#3415)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | installed-plugins.js header said both resolvers pass excludeHome before Task 2 landed (transient) | fixed | Task 2 commit 196962e47 made it true |
| 2 | build | readInstalledPlugins assumes readFile throws Error objects (non-Error throw theoretical) | deferred | Origin: SDD Task 1 review. Files: plugin/bin/lib/installed-plugins.js. Revisit if an injected readFile ever throws a non-Error |
| 3 | build | Valid-but-non-object JSON returns ok:true; callers guard the shape (matches prior behavior) | deferred | Origin: SDD Task 1 review. Files: plugin/bin/lib/installed-plugins.js. Revisit if a third caller of readInstalledPlugins is added |
| 4 | build | impeccable-engine/index.js header (lines 11-26) still names ~/.claude/plugins/installed_plugins.json — dated #2979 ASSUMPTION note | deferred | Origin: SDD Task 2 review; final review: historical note, not current behavior. Files: plugin/bin/lib/impeccable-engine/index.js. Revisit next time that header is edited |
| 5 | build | AC6.1 pins only the excluded-home half; the default-off half is pinned in installed-plugins.test.js | deferred | Origin: SDD Task 2 review. Files: tests/bin-lib/impeccable-engine/resolve.test.js. Revisit if excludeHome becomes configurable for Impeccable |
| 6 | build | AC3 test upper-cases the whole temp path (non-ASCII temp root would skip, not fail) | deferred | Origin: SDD Task 2 review. Files: tests/bin-lib/impeccable-engine/resolve.test.js. Revisit if the test is seen skipping on a case-insensitive CI volume |
| 7 | build | plugin-structure.md said "probe-confirmed for each" without #3380/#3415 citations | fixed | 9d7d539c6 |
| 8 | build | Ruling: Task 3's plan Step 4 (full npm test) not run by the implementer; /build Common Step 5 runs the full suite centrally | observation | |
| 9 | build | resolve() gives no detail when the only Impeccable entry is a skipped home-directory project entry (UX gap; the fix text still leads to a working state) | deferred | Origin: SDD final whole-branch review Minor 3. Files: plugin/bin/lib/impeccable-engine/index.js:163-165. Revisit with item 10's follow-up |
| 10 | build | Follow-up record needed: Impeccable project-scope entries at 3.0.6 (memenu-app, synology-nas, jarvis, home-assistant-config-kajeroedvej, several worktrees) do not load in real sessions (#3415 probe: memenu-app ran user 4.6.0 while its superpowers 6.3.0 project entry loaded), so resolve() reports upgrade-required where sessions actually run 4.6.0. Ruled out: missing 3.0.6 cache dir, project settings not enabling impeccable@impeccable. Recorded only as "observed, not encoded" in installed-plugins.js:14-18 | open | |
