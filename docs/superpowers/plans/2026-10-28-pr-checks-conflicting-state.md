# pr-checks.js `conflicting` State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bin/pr-checks.js` reports a merge-conflicted PR as its own `conflicting` state, and every gate and `--pr` reader routes it instead of reading it as `no-ci`/`pending`/`green`.

**Architecture:** `classifyMergeState` moves (verbatim) from `bin/pr-merge-state.js` into `bin/lib/pr-checks/classify.js`; `pr-merge-state.js` re-imports it. A new pure `applyMergeState(verdict, view)` in the same lib holds the whole precedence rule, and `pr-checks.js`'s `classifyPr` calls it right after `classifyRollup`, before the red-only base read. Prose routing cites `_shared/git-discipline.md`'s Post-push merge-state check / Catch-up rather than restating it.

**Tech Stack:** Node 18+ CommonJS, `node --test`, markdown skill prose.

**Spec:** `.claude-tweaks/pipelines/2026-10-28T120514-record-4366/work/4366-spec.md`

Scope keywords: classifyMergeState, no-ci | read-failed, STATUS_BY_STATE, ci.state

## Global Constraints

- Merge state `UNKNOWN` is never a conflict and is never re-read inside the CLI.
- `conflicting` replaces `red`, `inherited-red`, `pending`, `green`, `no-ci`. `stale` wins over it. `no-pr`, `gh-absent`, `read-failed` from a failed/malformed `gh pr view` stay as they are.
- `pr-merge-state.js`'s stdout stays byte-identical on its existing tests.
- Every envelope that is not `conflicting` stays byte-identical (the `cli.test.js` characterization tests must pass unchanged).
- `--pr` never writes `decisions.md` and never carries `logged`.
- `auto`/`confirm` never get a new stop on `conflicting` (a merge conflict is not a HARD-GATE); only `interactive`/`hybrid` stop.
- Read-limit rail: `plugin/skills/review/code-mode-steps.md` is 51,037 B and `plugin/skills/_shared/github-pr-scan.md` is 50,324 B against `RAIL_BYTES` 52,500 B — headroom 1,463 B and 2,176 B. Additions there must be a few dozen bytes each.
- `bin/lib/flow/preflight.js`'s inline `CONFLICTING` check is left alone: it tests `mergeable` only, so swapping in `classifyMergeState` (which also fires on `DIRTY`) would change its output.

## Review Focus

1. A closed or merged PR whose view still says `DIRTY` — expected: no `conflicting` (mirrors `pr-merge-state.js`'s `not-open` rule). Pinned in Task 1 (`applyMergeState` ignores a non-`OPEN` `state`) and Task 2 (`gh pr view` requests `state`).
2. A conflicting PR whose head-runs read fails — expected: `conflicting`, not `read-failed` (the conflict is conclusive from the view alone). Pinned in Task 2.
3. A conflicting PR with red checks — expected: `conflicting`, and no base-tip read is spent. Pinned in Task 2.
4. A view with `mergeStateStatus: DIRTY` but a malformed rollup — expected: `read-failed` stays. Pinned in Task 1.
5. A newer CLI's `conflicting` reaching a `--pr` reader's lookup table — expected: never `passing`. Pinned in Task 4 (the item-3 script maps it to `conflicting`; an unmapped state already falls to `unavailable`).

---

### Task 1: Shared merge-state classifier and precedence rule

**Role:** integration

**Files:**
- Modify: `plugin/bin/lib/pr-checks/classify.js` (header comment; add `classifyMergeState`, `CHECK_DERIVED_STATES`, `applyMergeState`; export them)
- Modify: `plugin/bin/pr-merge-state.js:59-69,148` (delete the local `classifyMergeState`; `require` it from `./lib/pr-checks/classify`; keep exporting it)
- Test: `tests/bin-lib/pr-checks/classify.test.js`, `tests/bin-lib/pr-merge-state/cli.test.js`

**Interfaces:**
- Produces: `classifyMergeState(view) -> 'conflicting'|'no-conflict'|'unknown'` (body moved verbatim, including its `isStr` helper use).
- Produces: `CHECK_DERIVED_STATES = Object.freeze(['red','inherited-red','pending','green','no-ci'])`.
- Produces: `applyMergeState(verdict, view) -> verdict'`. Returns `verdict` itself (same object) unless `verdict.state` is in `CHECK_DERIVED_STATES`, `view.state` is not a string other than `'OPEN'`, and `classifyMergeState(view) === 'conflicting'`; then returns `{ state: 'conflicting', failing: [], pending: [], headRefOid: verdict.headRefOid ?? null, mergeable, mergeStateStatus, baseBranch }` in exactly that key order, where `mergeable`/`mergeStateStatus` are the view's strings or `null`, and `baseBranch` is `view.baseRefName` when a non-empty string, else `null`.

- [ ] **Step 1: Write the failing tests** in `classify.test.js`:
  - `classifyMergeState`: `{mergeStateStatus:'DIRTY', mergeable:'MERGEABLE'}` → `conflicting`; `{mergeStateStatus:'BLOCKED', mergeable:'CONFLICTING'}` → `conflicting`; `{UNKNOWN, UNKNOWN}` → `unknown`; `{CLEAN, MERGEABLE}` → `no-conflict`; `{}` → `unknown`.
  - `applyMergeState`: for each of `no-ci`, `pending`, `green`, `red`, `inherited-red` with view `{ state:'OPEN', mergeStateStatus:'DIRTY', mergeable:'CONFLICTING', baseRefName:'main' }` → `deepEqual({ state:'conflicting', failing:[], pending:[], headRefOid:HEAD, mergeable:'CONFLICTING', mergeStateStatus:'DIRTY', baseBranch:'main' })`.
  - `stale` and `read-failed` verdicts with a DIRTY view → `strictEqual` to the input verdict.
  - `{ mergeStateStatus:'UNKNOWN', mergeable:'UNKNOWN' }` over a `green` verdict → `strictEqual` input.
  - `{ state:'MERGED', mergeStateStatus:'DIRTY' }` over `no-ci` → `strictEqual` input; `{ mergeStateStatus:'DIRTY' }` with no `state` key → `conflicting` and `baseBranch: null`.
  - In `tests/bin-lib/pr-merge-state/cli.test.js`: `assert.equal(require('../../../plugin/bin/pr-merge-state').classifyMergeState, require('../../../plugin/bin/lib/pr-checks/classify').classifyMergeState)`.

- [ ] **Step 2: Run to verify they fail**
  Run: `node --test tests/bin-lib/pr-checks/classify.test.js tests/bin-lib/pr-merge-state/cli.test.js`
  Expected: FAIL (`classifyMergeState`/`applyMergeState` not exported by classify.js).

- [ ] **Step 3: Implement** the move and `applyMergeState` per Interfaces. Extend classify.js's header comment with one paragraph: merge-state classification (#2986's rule, moved here so both CLIs import one function) and the #4366 precedence rule.

- [ ] **Step 4: Run to verify they pass**
  Run: `node --test tests/bin-lib/pr-checks/ tests/bin-lib/pr-merge-state/ tests/git-discipline-merge-state-conformance.test.js`
  Expected: PASS, with every pre-existing `pr-merge-state` test unchanged.

- [ ] **Step 5: Commit** — `Move classifyMergeState into the pr-checks lib — add applyMergeState precedence rule, refs #4366`

### Task 2: `conflicting` state in pr-checks.js

**Role:** integration
**Review risk:** high

**Files:**
- Modify: `plugin/bin/pr-checks.js` (header comment lines 18-42, USAGE lines 58-64, `DEGRADED`/`gateEntry`, `classifyPr`)
- Modify: `docs/plugin-structure.md:200` (state list, envelope, logging summary)
- Test: `tests/bin-lib/pr-checks/cli.test.js`

**Interfaces:**
- Consumes: `applyMergeState` from Task 1.
- Produces: the `conflicting` envelope `{"failing":[],"pending":[],"headRefOid":…,"localHead":…,"pr":n,"state":"conflicting","mergeable":…,"mergeStateStatus":…,"baseBranch":…}` (+ `"logged":…` under `--run`) — `report()`'s defaults followed by Task 1's object spread, then `localHead` and `pr`.
- Produces: under `--run`, one `AUTO` entry, step `PR-check gate`, reversibility `n/a`, text exactly: `PR #{pr} conflicts with {baseBranch, or "its base branch" when null} (mergeStateStatus {mss}, mergeable {m}) — no pull_request CI runs until the branch is caught up`.

- [ ] **Step 1: Write the failing tests** in `cli.test.js`:
  - Update the two pinned `gh pr view` arg assertions (current lines 104 and 319) to `'headRefOid,statusCheckRollup,baseRefName,mergeable,mergeStateStatus,state'`.
  - `--pr 7`, view `{ headRefOid:HEAD, statusCheckRollup:[], baseRefName:'main', state:'OPEN', mergeStateStatus:'DIRTY', mergeable:'CONFLICTING' }`, `hasPullRequestCi: () => false` → stdout byte-equal to `JSON.stringify({ failing:[], pending:[], headRefOid:HEAD, localHead:null, pr:7, state:'conflicting', mergeable:'CONFLICTING', mergeStateStatus:'DIRTY', baseBranch:'main' }) + '\n'`; same with `hasPullRequestCi: () => true`.
  - `mergeable:'CONFLICTING'` + `mergeStateStatus:'BLOCKED'` + `[PASS]` rollup → `conflicting`.
  - `UNKNOWN`/`UNKNOWN` + `[PASS]` → `green`.
  - `--run`, DIRTY view whose `headRefOid` is `'d'.repeat(40)` → `stale`.
  - DIRTY view + a FAILURE rollup → `conflicting`, and no recorded gh call starts with `api` (no base read).
  - DIRTY view + `gh run list` throwing → `conflicting`.
  - `--run --section /test` on the DIRTY view → `logged: true`, exactly one decisions.md entry matching `/^- AUTO /`, `afterStamp` equal to `— PR-check gate: PR #7 conflicts with main (mergeStateStatus DIRTY, mergeable CONFLICTING) — no pull_request CI runs until the branch is caught up. Reversibility: n/a.`
  - `--pr` on the DIRTY view: no `logged` key in the envelope.
  - `--help` output's `state:` line includes `conflicting`.

- [ ] **Step 2: Run to verify they fail**
  Run: `node --test tests/bin-lib/pr-checks/cli.test.js`
  Expected: FAIL (state `no-ci`/`pending`/`green`/`red` where `conflicting` is expected; arg pins differ).

- [ ] **Step 3: Implement.** In `classifyPr`, request the six fields; immediately after `classifyRollup`, `const merged = applyMergeState(verdict, view)`; when `merged.state === 'conflicting'` return `report(deps, { ...merged, localHead, pr: n }, audit)` — before the base read and before the `runsFailure` check. Add the `conflicting` branch to `gateEntry`. Update the header comment and USAGE: state list gains `conflicting` after `stale` (`red | inherited-red | pending | stale | conflicting | green | no-ci | read-failed | no-pr | gh-absent`), the envelope list gains `mergeable?, mergeStateStatus?`, the logging line names `AUTO on … conflicting`, and one header paragraph states the precedence (cite `lib/pr-checks/classify.js`'s `applyMergeState`). Update `docs/plugin-structure.md:200` the same way.

- [ ] **Step 4: Run to verify they pass**
  Run: `node --test tests/bin-lib/pr-checks/ tests/pr-check-gate-conformance.test.js`
  Expected: `cli.test.js` and `classify.test.js` PASS, including the unchanged characterization tests. `pr-check-gate-conformance.test.js`'s "every state pr-checks.js can print is routed" test now FAILS on `conflicting` — Task 3 fixes it; do not edit that test here.

- [ ] **Step 5: Commit** — `Add conflicting state to pr-checks.js — DIRTY or CONFLICTING replaces check-derived states, refs #4366`

### Task 3: Gate routing prose

**Role:** judgment

**Files:**
- Modify: `plugin/skills/_shared/pr-check-gate.md` (Classification-authority paragraph: one sentence naming the merge-state read; envelope line in "When it runs"; new `conflicting` bullet in "Routing by `state`", after `red`)
- Modify: `plugin/skills/review/code-mode-steps.md:74` (`unless it is \`red\`` → `unless it is \`red\` or \`conflicting\` (\`_shared/pr-check-gate.md\` routes both)`), `:108` (first gate row's `not \`red\`` → `not \`red\`/\`conflicting\``), and one new gate row after the `red` row
- Modify: `plugin/skills/test/SKILL.md:75` (name `conflicting`: routed per the gate — catch-up in `auto`, a gate failure in `interactive`/`hybrid`) and `:200` (`a \`red\` result` → `a \`red\` result (or a \`conflicting\` one the gate stops on)`)
- Test: `tests/pr-check-gate-conformance.test.js`

**Interfaces:** consumes Task 2's state name and AUTO entry text.

The `conflicting` bullet must say, citing and not restating `_shared/git-discipline.md`'s Post-push merge-state check and its **Catch-up (`auto`)** steps:
- the CLI already wrote one `AUTO` entry naming the PR and `baseBranch`; on `logged: false` write it with `log-decision.js --status AUTO --step "PR-check gate" --reversibility n/a --text-file` (forge-supplied base name);
- `auto`/`confirm`: run that Catch-up (`--section "{/test|/review}"`), then re-run this gate once; the re-run routes by its own state, and a second `conflicting` (catch-up aborted or skipped) passes with a caveat — `TEST_PASSED` set carrying it, `/review` proceeds — leaving the conflict to the merge path (`_shared/pr-first-merge.md`);
- `interactive`/`hybrid`: a gate stop — do not set `TEST_PASSED` (`/test`), **STOP** (`/review` Step 1.5) — giving the catch-up commands from that section.

The new code-mode-steps row: `| \`pr-checks.js\` reports \`conflicting\` (\`_shared/pr-check-gate.md\`) | \`auto\`: catch up and re-run the gate once; \`interactive\`/\`hybrid\`: **STOP** with the catch-up commands |`.

- [ ] **Step 1: Write the failing tests** in `pr-check-gate-conformance.test.js`:
  - `conflicting` bullet (`section(GATE, /\*\*\`conflicting\`\*\*/, /\n- \*\*/)`) includes `_shared/git-discipline.md`, `Catch-up`, `re-run`, `once`, `interactive`, `hybrid`, `do not set \`TEST_PASSED\``, and matches `/--status AUTO/`.
  - Review Step 1.5 gate table matches `/\|[^|\n]*`conflicting`[^|\n]*\|[^\n]*\*\*STOP\*\*/`.
  - test/SKILL.md Pipeline behavior includes `` `conflicting` ``.
  - Go-red control: deleting the `conflicting` bullet from `GATE` makes the bullet assertion throw.

- [ ] **Step 2: Run to verify they fail**
  Run: `node --test tests/pr-check-gate-conformance.test.js`
  Expected: FAIL (no `conflicting` bullet, row, or test/SKILL.md mention).

- [ ] **Step 3: Write the prose** per the Files list above. Check `wc -c plugin/skills/review/code-mode-steps.md` stays under 52,500.

- [ ] **Step 4: Run to verify they pass**
  Run: `node --test tests/pr-check-gate-conformance.test.js tests/git-discipline-merge-state-conformance.test.js tests/skill-size-single-source.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit** — `Route the conflicting PR-check state in the test and review gates — catch-up in auto, stop in interactive, refs #4366`

### Task 4: `--pr` display readers

**Role:** integration

**Files:**
- Modify: `plugin/skills/_shared/github-pr-scan.md:41` (item 3: add `` `conflicting` → `CI conflicting` (no CI runs until caught up), never passing ``) and `:67` (`STATUS_BY_STATE` gains `['conflicting', 'conflicting']`). Item 9's filter (`:163`, `:171`) admits only `green`/`no-ci` — no change.
- Modify: `plugin/skills/dispatch/settle-parked.md:57` (append `` `conflicting` → `conflicting` (never `passing`) ``)
- Modify: `plugin/skills/wrap-up/review-console-interactive.md:46-47,57` (`conflicting` → option 2 carries Recommended: the merge cannot land until the branch is caught up)
- Modify: `plugin/bin/lib/wrap-up/pack.js:651-655` comment only — the probe passes `ci` through verbatim, so `conflicting` reaches the console unmapped; say so in the comment
- Test: `tests/display-ci-readers-conformance.test.js`, `tests/bin-lib/wrap-up/pack.test.js`

**Interfaces:** consumes Task 2's state name.

- [ ] **Step 1: Write the failing tests:**
  - `display-ci-readers-conformance.test.js`: settle-parked's CI bullet matches `` /`conflicting` → `conflicting`/ ``; the console paragraph's Option 2 slice includes `conflicting`; github-pr-scan item 3 prose includes `` `conflicting` → `CI conflicting` ``; running item 3's `STATUS_BY_STATE` map (extract the `new Map([...])` literal from the item-3 fence and `eval` it with `new Function`) gives `get('conflicting') === 'conflicting'`.
  - `pack.test.js`: with `depsWithPrChecks` returning `'{"state":"conflicting","failing":[],"pending":[],"mergeStateStatus":"DIRTY","mergeable":"CONFLICTING","baseBranch":"main"}\n'`, `pack.pr.value.ci.state === 'conflicting'` and `ci.baseBranch === 'main'`.

- [ ] **Step 2: Run to verify they fail**
  Run: `node --test tests/display-ci-readers-conformance.test.js tests/bin-lib/wrap-up/pack.test.js`
  Expected: display-ci-readers FAILS on the new needles; the pack test PASSES already (append-shaped: pins today's pass-through).

- [ ] **Step 3: Edit the four files** per the Files list. Check `wc -c plugin/skills/_shared/github-pr-scan.md` stays under 52,500.

- [ ] **Step 4: Run to verify they pass**
  Run: `node --test tests/display-ci-readers-conformance.test.js tests/bin-lib/wrap-up/pack.test.js tests/issue-claims-pr-scan-composition.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit** — `Map the conflicting PR-check state in every pr-checks.js --pr reader, refs #4366`
