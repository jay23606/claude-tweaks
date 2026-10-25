# Open Items — Collapse per-step bookkeeping into self-logging CLIs and a single phase-exit call (#4026)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/ops | Measure #4026 AC1 (`log-decision.js` calls per pipeline ≤ 10) and AC4 (median tool round trips from timing.json down ≥ 25 % vs baseline 407) over 10 post-merge pipeline runs (reason-not-auto: live-verification — needs 10 real future pipeline runs on the merged plugin; cannot run inside this build) | open | — |
| 2 | build | SDD T1: `entryProblem` rejects unknown element keys and multi-line step/lever/section — stricter than the single-entry flags; later batch writers must use `ENTRY_KEYS` | deferred | — |
| 3 | build | SDD T1: `appendEntries` with items `[]` is a silent no-op (`created:false`) | deferred | — |
| 4 | build | SDD T2: AC4.1/throwing-resolver tests weakened to `doesNotMatch AUTO` — SKIP existence covered elsewhere | deferred | — |
| 5 | build | SDD T2: `logged:false` means append-threw OR silent state — prose restricts the hand-log fallback to conflicting + the three degrade states | deferred | — |
| 6 | build | SDD T2: uneven comment wrap `pr-merge-state.js:58-64` | deferred | — |
| 7 | build | SDD T3: `ghFailed` defined mid-run, cannot serve a future earlier exit-5 site (cosmetic) | deferred | — |
| 8 | build | SDD T3: pr-checklist entries carry no section while pr-merge-state uses the phase section — matches prior prose | deferred | — |
| 9 | build | SDD T4: Manifesto step label hard-coded for every `set-config.js --set` batch (all current callers are Manifesto-family) | deferred | — |
| 10 | build | SDD T4: `auto-decision-log.md` Manifesto example lacks the `Reversibility: n/a.` tail | deferred | — |
| 11 | build | SDD T5: pr-checks `logged:false` also on green/red (no-log states) — prose restricts fallback correctly | deferred | — |
| 12 | build | SDD T6: verify-run-bookends SKIP text collapses whitespace (`/\s+/` → space) while `log-decision --text-file` only trims trailing | deferred | — |
| 13 | build | SDD T7: `docs/journeys/clear-an-archive-refusal-for-an-untiebroken-finding-3945.md:59` still says `log-decision.js` failed twice (sibling 3947 journey updated) | deferred | — |
| 14 | build | SDD T7: tiebreak parity tests hardcode the old prose argv rather than reading prose | deferred | — |
| 15 | build | SDD T8: `multispec-review-console.md` step 0 report list omits unattributable (pre-existing) | deferred | — |
| 16 | build | SDD T8: multi-spec teardown logs step label `Cleanup item 2` though it is step 0 | deferred | — |
| 17 | build | SDD T1: the optional-locks scanner `ARGV_STATUS` false-positives on any first-position status array literal — scanner refinement is a follow-up | deferred | — |
| 18 | build | SDD T9: no `MULTISPEC_PARALLEL_WAVE=1` guard in the phase-exit CLI — callers keep the skip | deferred | — |
| 19 | build | SDD T9: `parsePorcelainZ` checks only the X column for R/C | deferred | — |
| 20 | build | SDD T9: FAILED-degrade check reads the parent run dir of `spec-*` but `hasLoggedPrEarlyStep1` reads only the run dir | deferred | — |
| 21 | build | SDD T9: phase-exit PR rule lacks the gate's materialize-commit precondition (slightly stricter) | deferred | — |
| 22 | build | SDD T9: push-breadcrumb dedupe keys on `path.resolve(wt)` vs the hook-parsed target-dir spelling | deferred | — |
| 23 | build | SDD T9: real `appendEvent` swallows its write errors, so event failures only reach `logFailures` via the seam | deferred | — |
| 24 | build | SDD T10: `review/code-mode-steps.md` has 1 B headroom; its phase-exit sentence omits section names | deferred | — |
| 25 | build | SDD ruling — every task that adds a CLI flag (T1 `--entries`, T5 `--section`, T7 `--run`) also sweeps restated command lines for that CLI: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 26 | build | SDD ruling — T2's SKIP step is exactly `Post-push merge-state check`, not `… (degraded)`; AC3.1 parity binds over the degrade-trace tag convention: ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
| 27 | build | SDD ruling — overlap an implementer with the previous task review only when files are disjoint: ratify or reverse at the Review Console (staged/sdd-ruling-3.md) | open | — |
| 28 | build | SDD ruling — the Manifesto snapshot header is prepended above any existing decisions.md lines (claim-log, set-config), never written over them: ratify or reverse at the Review Console (staged/sdd-ruling-4.md) | open | — |
| 29 | build | SDD ruling — phase-exit's own log section is pr-merge-state's PHASE_SECTIONS; an archived run dir never gets a record-worktree backfill: ratify or reverse at the Review Console (staged/sdd-ruling-5.md) | open | — |
| 30 | build | SDD ruling — phase-exit runs the worktree-stamp backfill under local-merge too: ratify or reverse at the Review Console (staged/sdd-ruling-6.md) | open | — |
| 31 | build | SDD ruling — the PR backfill entry text is exactly `backfilled PR-early lifecycle before phase-exit push`, PR number only in the envelope: ratify or reverse at the Review Console (staged/sdd-ruling-7.md) | open | — |
| 32 | build | SDD ruling — AC1 high-volume `--entries` batching of model-judged log sites is deferred to a follow-up record, pending per-site counts from real post-merge transcripts: ratify or reverse at the Review Console (staged/sdd-ruling-8.md) | open | — |
| 33 | build | SDD ruling — the final fix wave covers Important 1-4 plus minors 5-6; the other final-review minors stay deferred: ratify or reverse at the Review Console (staged/sdd-ruling-9.md) | open | — |
| 34 | build | SDD final review (minor): re-running `phase-exit.js` (the two prose-mandated re-runs: after opening the PR, after a manual `record-worktree`) writes the dirty-tree and refused-push lines a second time — consider a `--rerun` flag or dedupe against existing lines | deferred | — |
| 35 | build | SDD final review (minor): entries batched for `log-decision.js --entries` are lost if the session dies before phase end; no resume guidance tells the next session to flush the pending entries file | deferred | — |
| 36 | build | SDD final review (minor): phase-exit's `resolveIntegrationBranch` spawns `resolve-policy.js` though `lib/policy.js` `readIntegrationBranch` already exists | deferred | — |
| 37 | build | SDD fix wave (concern): the Leave-open mergeability re-check (`wrap-up/execution-and-verification.md`) names `mergeState.exit` null but not `mergeState` itself null, the shape when the wrap-up push failed | deferred | — |
| 38 | build | SDD fix wave (concern): `GIT_PUSH_TIMEOUT_MS` is env-only (`CLAUDE_TWEAKS_GIT_PUSH_TIMEOUT_MS`); an additive `git-push-timeout-ms` policy key would move the pinned `POLICY_KEYS` count | deferred | — |
| 39 | build | SDD fix wave (concern): `_shared/git-discipline.md`'s envelope routing does not name phase-exit's wd-push-mismatch refusal by name (it falls under the generic refused-push route; the Review Console surfaces the event) | deferred | — |
| 40 | build | SDD follow-up (pre-existing): `pr-check-gate.md`'s pending caveat says HEAD not yet pushed when an empty rollup reads pending with no names — file via `/claude-tweaks:capture` | open | — |
| 41 | build | SDD follow-up (pre-existing): `task-prompt.md`/`claim-targets.md` say the verify-run-bookends degrade line prints on exit 0, though it also prints on exit 1 — file via `/claude-tweaks:capture` | open | — |
| 42 | build | SDD follow-up (pre-existing): the closing-links exit-3 hand log in prose will usually be refused by `log-decision.js` (same unanchored run dir) — file via `/claude-tweaks:capture` | open | — |
