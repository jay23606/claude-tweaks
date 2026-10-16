# Late Findings — QA Freshness Refresh (#3047)

Read by `code-mode-steps.md` Step 6.7 once it has applied one or more findings this run (auto-applied under the resolved ceiling, or interactively via "Fix now" in the batch table — this applies identically to both, Deliverable 3) AND a pipeline run directory exists. A standalone review with no run directory has no QA stories to refresh and never reads this file.

1. **Collect the wave's changed files.** `git diff --name-only {pre-wave-sha}...HEAD` (the commit this run's QA validation ran against, before Step 6.7 applied anything) — the same plain-diff approach `step3-routing.md`'s post-dispatch diff audit already uses for a fix wave, never a hand-rolled working-tree diff.
2. **Read every discovered QA story's `source_files`** — the same field `/claude-tweaks:test`'s `qa affected` mode reads (`test/SKILL.md`'s "Affected filtering" section).
3. **No intersection** between the wave's changed files and any story's `source_files` → stop here. No re-run, no added cost, no change to Step 7's QA Validation line — it still reports `/test`'s original pre-wave result.
4. **Intersection exists, a dev server/browser is available** → re-run `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js"`-free: invoke `/claude-tweaks:test qa affected` (its own changed-file read, `verify.js --changed-files`, naturally picks up the wave's now-committed edits). Fold the fresh result into Step 7's QA Validation line, replacing the pre-wave status outright — this is the common case, not a special qualifier.
5. **Intersection exists, but the re-run self-skips** (headless run, no dev server — the same self-skip `test/SKILL.md`'s `affected` mode already has) → do not re-render the pre-wave status as if it were still current. Render `review-summary-template.md`'s staleness qualifier instead: `{status} — ran before the review's fix wave ({N} commits since); stories touching changed files: {ids}` — `{N}` is the wave's own commit count (from the diff in step 1), `{ids}` the intersecting story ids from step 2/3.
6. The verdict comment (`code-mode-steps.md` Step 7's "Verdict comment" section) reads this same resolved QA line — never a separately worded summary of the same fact.

Run once, after the whole Step 6.7 wave has resolved — never per finding, matching the wave's own single-pass apply.
