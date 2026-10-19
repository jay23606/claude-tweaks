# Two-call dispatch call-1 bookkeeping verification (#2912) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a dispatched first call (`/flow #N build,test`) unable to report `DONE`/`build-test-ok` — and the dispatching session unable to pass it — without a committed `work/{n}-spec.md`, a `run-state.json.worktree` stamp, a `run-state.json.pr` stamp under `pr-first`, and a canonical `Step 2.8: claimed #{n}` line.

**Architecture:** The trace (below) shows call 1 of run `2026-10-02T182455-record-2765` never executed `/flow` Step 4.2 / `/build` Spec Step 1 (candidate 2), and that every in-call bookkeeping check is armed only by a materialize commit, so a call that never materializes is invisible to all of them. The two post-condition checks that do not depend on a materialize commit — `plugin/bin/verify-run-bookends.js` (call 1's own pre-DONE check) and `plugin/bin/lib/dispatch/first-call-artifact-check.js` (the dispatcher's #2837 gate) — read `integration-model` from the run's `config.yml` only, which the Manifesto never writes (`MANIFESTO_LEVERS` has 13 levers, none is `integration-model`), so their PR check is dead in every real run. Fix both to resolve the model the way `pre-tool-use.js` already does (`resolveRunPinnedIntegrationModel`: run-config pin, then `policy.yml`, then detection), widen `verify-run-bookends.js` with the committed-spec and canonical-claim-line bookends, and tell call 1 (the dispatch template it actually receives) to run it on every transport before reporting `DONE`.

**Tech Stack:** Node 18+ CommonJS, `node --test`, markdown skill prose.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T074013-record-2912/work/2912-spec.md`

## Trace (Deliverable 1 — evidence, gathered at plan time)

- PR #2911 (run `2026-10-02T182455-record-2765`, branch `worktree-flow-spec-2765`) commits: `99fa1f73b` build fix at 18:36:56Z, then `26ecca0146` "Materialize spec for #2765" at 18:55:18Z — the materialize commit postdates the build commit, i.e. it is call 2's case-3 backfill. Call 1 implemented before (and without) Spec Step 1's materialize commit, so `/flow` Step 4.2 → `/build` Spec Step 1 → `worktree-setup.md` Step 6 never ran: **candidate 2** (call 1 bypassed `/flow`'s build step — the #3212 "full bypass" shape, Standard profile at the time).
- Candidate 1 refuted: `dispatch/SKILL.md` Step 4 at `2393d0a3a` (main at the incident time) is mkdir-only (`resolve-run-dir --create`), no materialize.
- Candidate 3 refuted: the prior run's PR #2881 used branch `worktree-record-2765`, the new run `worktree-flow-spec-2765` — no branch/PR reuse; the tombstone re-claim itself succeeded (call 1 logged it).
- Claim line: "Step 2.8: claimed issue #2765 … reclaimed stale tombstone" is not `claim-targets.js` output shape (it has no such text) — hand-written. At the time the gh path did not write the line itself (#2775 later made it); the MCP path still relies on the agent typing the `log-decision.js` command.
- Why nothing caught it: `checkBookkeepingStampsGate` and `checkPrBookkeepingPrecondition` both return early on `!hasMaterializeCommit`; `verify-run-bookends.js` on this very run prints `{"ok":true,"confirmed":{"worktree":true,"pr":"n/a",...}}` although the project is `pr-first` — its PR check never fires.
- Already landed since, not redone here: #3224 (Capable first call), #3225 (`checkDispatchConfigGate` denies commits until `config.yml` exists), #3242 (case-2 adoption), #3012 (paraphrase tolerance in the stamps gate).

## Global Constraints

- Claim-line canonical form is exactly `Step 2.8: claimed #{n}` followed by a word boundary (spec AC3: `Step 2\.8: claimed #{n}\b`).
- Fix at the divergence point; call 2's case-3 recovery (`flow/steps-and-gates.md` case 3) is not changed.
- Do not widen the claim race window (no new claim writes, no change to `claim-targets.js`).
- Commit messages: `{Verb} {what} — {detail}`, `refs #2912`, never `closes`/`fixes`.

## Review Focus

- A multi-spec parent run dir (`--targets 2912,2913`, specs at `{run}/spec-{n}/work/{n}-spec.md`) — the committed-spec check must accept that layout. (Task 1 test.)
- A `local-merge` project with no `policy.yml` key and no remote — PR bookend must stay `n/a`. (Task 1 test via injected model.)
- A spec file present on disk but never committed — must be reported missing, not confirmed. (Task 1 real-git test.)
- A paraphrased claim line ("claimed issue #N") — must be reported missing for `verify-run-bookends.js` even though the stamps gate tolerates it. (Task 1 test.)
- Unreadable `decisions.md` / git failure — reported missing with a reason, never a crash. (Task 1 tests.)

---

### Task 1: verify-run-bookends.js — resolved integration model, committed-spec and canonical claim-line bookends

**Files:**
- Modify: `plugin/bin/lib/log-decision/claim-log.js` (add + export `hasCanonicalClaimLogFor`)
- Modify: `plugin/bin/verify-run-bookends.js`
- Test: `tests/verify-run-bookends.test.js`, `tests/bin-lib/log-decision/claim-log.test.js`, `tests/bin-lib/flow/preflight.test.js`

**Interfaces:**
- Consumes: `resolveRunPinnedIntegrationModel(mainRoot, runDir)` exported from `plugin/bin/lib/hooks/pre-tool-use.js`; `mainCheckoutRoot(p)` from `plugin/bin/lib/hooks/worktree-detect.js`; `RUN_ID_RE` from `plugin/bin/lib/hooks/context.js`.
- Produces: `hasCanonicalClaimLogFor(body: string|null, n: number) -> boolean` (claim-log.js). `verify-run-bookends.js` deps gain `readIntegrationModel(runDir, runState) -> string|null` (signature widened, old one-arg fakes still work), `isSpecCommitted({ runDir, worktree, issue }) -> true|false|null` (null = could not determine), `readDecisions(runDir) -> string|null`. Each `missing` entry gains a `remedy` string; `confirmed` gains `materialize: number[]` and `claimLog: number[]`. New bookend names: `'materialize'`, `'claim-log'`.

- [ ] **Step 1: Write the failing tests**

In `tests/bin-lib/log-decision/claim-log.test.js`:
- `AC3.1: hasCanonicalClaimLogFor accepts only the exact Step 2.8 claimed #{n} form` — true for a line `- AUTO 09:41:32 — Step 2.8: claimed #2912 (bin/claim-targets.js, transport: git). Reversibility: high.`; false for `Step 2.8: claimed issue #2912`; false for `claimed #29120` when n=2912; false for null.

In `tests/verify-run-bookends.test.js` (extend `makeDeps` defaults so every existing test keeps passing: `isSpecCommitted: () => true`, `readDecisions: () =>` canonical lines for 1728 and 1729):
- `AC1.3: realDeps.readIntegrationModel resolves pr-first from policy.yml when config.yml carries no integration-model` — temp dir `root/.claude-tweaks/policy.yml` = `integration-model: pr-first\n`, run dir `root/.claude-tweaks/pipelines/2026-10-19T074013-record-2912/config.yml` with the 13 Manifesto levers and no `integration-model` line; `realDeps.readIntegrationModel(runDir, { worktree: root })` === `'pr-first'`.
- `AC1.1: a target whose spec is not committed -> exit 1, missing materialize bookend with a materialize.js remedy` — `isSpecCommitted: () => false`; `missing` has `{bookend:'materialize', issue:1728}` and its `remedy` matches `/materialize\.js 1728/`.
- `AC1.1: realDeps.isSpecCommitted is true only for a spec committed at HEAD` — temp git repo (`git init`, user config via `-c`), write `.claude-tweaks/pipelines/{RUN_ID}/work/1728-spec.md`: false while untracked, true after commit; also true for `spec-1728/work/1728-spec.md` under the same run id.
- `AC3.1: a paraphrased claim line -> exit 1, missing claim-log bookend whose remedy is the canonical log-decision.js command` — `readDecisions: () => '- AUTO 09:00:00 — Step 2.8: claimed issue #1728. Reversibility: high.'`; missing `{bookend:'claim-log', issue:1728}`, `remedy` matches `/--step "Step 2\.8"/` and `/claimed #1728 \(bin\/claim-targets\.js/`.
- `unreadable decisions.md (null) -> missing claim-log, not a crash`; `isSpecCommitted returning null -> missing materialize with reason "undetermined"`.
- `all bookends confirmed -> payload.confirmed.materialize and .claimLog list the targets`.
- `AC4.1: on this record's own pre-fix shape (pr-first by policy, config.yml without the key, no PR, paraphrased claim, uncommitted spec) the CLI exits 1 naming pr, materialize and claim-log` — real deps for the model (temp policy.yml), injected `isSpecCommitted: () => false` and paraphrased `readDecisions`; exit 1 and the three bookend names present.

In `tests/bin-lib/flow/preflight.test.js` (pin, passes before and after — documents the scenario):
- `AC2.1: a dispatched run dir carrying call 1's full bookend set adopts as case 1, not case 3` — `seedCase1(fx)` plus `run-state.json` with `dispatched: true` and `decisions.md` holding the canonical claim line and a `## /build` entry; `computeAdoption(...).case === 1`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/verify-run-bookends.test.js tests/bin-lib/log-decision/claim-log.test.js`
Expected: FAIL (`hasCanonicalClaimLogFor is not a function`; AC1.3 gets `null`; no `materialize`/`claim-log` bookends)

- [ ] **Step 3: Implement**

`claim-log.js`: `hasCanonicalClaimLogFor` = `new RegExp(\`${STEP_SRC}: claimed #${n}\\b\`).test(text)` only — no batch or paraphrase fallback.

`verify-run-bookends.js`:
- `readIntegrationModel(runDir, runState)`: `worktree = runState && typeof runState.worktree === 'string' ? path.resolve(runState.worktree) : process.cwd()`; `mainRoot = mainCheckoutRoot(worktree) || worktree`; return `resolveRunPinnedIntegrationModel(mainRoot, runDir)`; any throw → `null` (PR bookend then not required, same as today's absent-key outcome). Delete `readConfigIntegrationModel`.
- `isSpecCommitted({ runDir, worktree, issue })`: candidate repo-relative paths under `.claude-tweaks/pipelines/` — if `basename(runDir)` matches `/^spec-\d+$/` and its parent basename matches `RUN_ID_RE`: `{parent}/{base}/work/{n}-spec.md`; else `{runId}/work/{n}-spec.md` and `{runId}/spec-{n}/work/{n}-spec.md`. True when `git -C {worktree} cat-file -e HEAD:{path}` exits 0 for any (forward slashes, `execFileSync` with `windowsHide: true` and `GIT_TIMEOUT_MS`); false when all exit non-zero and `git rev-parse --verify HEAD` succeeds; null when the worktree is unresolvable or git cannot run.
- `readDecisions(runDir)`: `fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8')`, null on error.
- In `run`: after the claim loop, per target push `{bookend:'materialize', issue, reason, remedy}` when `isSpecCommitted` is not `true` (reason `not-committed` / `undetermined`), and `{bookend:'claim-log', issue, reason:'no canonical Step 2.8 line', remedy}` when `!hasCanonicalClaimLogFor(decisions, issue)`. Remedies use `PLUGIN_ROOT = path.resolve(__dirname, '..')` and the literal run dir: worktree → `node "{PLUGIN_ROOT}/bin/hooks.js" record-worktree --run "{runDir}" "<worktree>"`; pr → `_shared/pr-early-run-lifecycle.md push-and-open-draft-PR, then node "{PLUGIN_ROOT}/bin/hooks.js" record-pr --run "{runDir}" <number> <url>`; materialize → `node "{PLUGIN_ROOT}/bin/materialize.js" {n} --run-dir "<worktree-local run dir>" then commit work/{n}-spec.md`; claim-log → `node "{PLUGIN_ROOT}/bin/log-decision.js" --run "{runDir}" --section "/flow" --step "Step 2.8" --status AUTO --reversibility high --text "claimed #{n} (bin/claim-targets.js, transport: {git|contents-api|mcp})"`; claim → `node "{PLUGIN_ROOT}/bin/claim-targets.js" --run-id "{runId}" --targets {n} --run "{runDir}"`.
- Update the header comment and `USAGE` (exit 0 line) to name all five bookends.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/verify-run-bookends.test.js tests/bin-lib/log-decision/claim-log.test.js tests/bin-lib/flow/preflight.test.js`
Expected: PASS (AC4.2: the affected suites pass)

- [ ] **Step 5: Real-input probe**

Run: `node plugin/bin/verify-run-bookends.js --run "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-10-19T074013-record-2912" --targets 2912` from the worktree.
Expected: exit 0 with `"pr":true` (before the fix it printed `"pr":"n/a"`). Independent count: `grep -c "Step 2.8: claimed #2912" {run}/decisions.md` ≥ 1 and `git cat-file -e HEAD:.claude-tweaks/pipelines/2026-10-19T074013-record-2912/work/2912-spec.md` exits 0.

- [ ] **Step 6: Commit** — `git add` the four files; `Widen verify-run-bookends to the full call-1 bookend set — refs #2912`.

### Task 2: first-call-artifact-check.js — resolve integration-model like the rest of the run

**Files:**
- Modify: `plugin/bin/lib/dispatch/first-call-artifact-check.js` (lines 39-50, 92-98, 148)
- Test: `tests/bin-lib/dispatch/first-call-artifact-check.test.js`

**Interfaces:**
- Consumes: `resolveRunPinnedIntegrationModel`, `mainCheckoutRoot` (as Task 1).
- Produces: `checkFirstCallArtifacts` deps gain `mainRoot` (string, default `mainCheckoutRoot(process.cwd()) || process.cwd()`) and `resolveModel(runDir) -> string|null` (default: `resolveRunPinnedIntegrationModel(mainRoot, runDir)`, throw → null). Remove the `resolveIntegrationModel(configRaw)` export and its stale "pins into config.yml" comment. Only caller of the export: none outside this file (`git grep -n "resolveIntegrationModel" -- tests plugin` shows the module's own lines and `policy-schema.js`'s unrelated function).

- [ ] **Step 1: Write the failing test** — `AC1.3: a realistic config.yml (13 Manifesto levers, no integration-model) under a policy.yml pr-first project with no recorded PR -> pr-missing`: temp `root/.claude-tweaks/policy.yml` = `integration-model: pr-first\n`; run dir under `root/.claude-tweaks/pipelines/{RUN_ID}` with the 13-lever `config.yml`, `run-state.json` `{ worktree: '/wt' }`, a live claim, a materialized header; call with deps `{ mainRoot: root }` (new optional dep, default `mainCheckoutRoot(process.cwd()) || process.cwd()`) and no `resolveModel` override. Expected `{ok:false, reason:'pr-missing'}`. Existing fixtures that put `integration-model:` in config.yml keep passing (the run-config pin still wins).
- [ ] **Step 2: Run** `node --test tests/bin-lib/dispatch/first-call-artifact-check.test.js` — Expected: FAIL (returns `ok:true`/`materialized-header-missing` instead of `pr-missing`).
- [ ] **Step 3: Implement** — replace `resolveIntegrationModel(configRaw)` with `resolveModel(runDir)` from deps (default uses `mainRoot` dep + `resolveRunPinnedIntegrationModel`); keep check order unchanged.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** — `Resolve integration-model in the first-call artifact check from policy, not config.yml alone — refs #2912`.

### Task 3: Tell call 1 to run the bookend check on every transport

**Files:**
- Modify: `plugin/skills/dispatch/task-prompt.md` (First call template, after the `CRITICAL:` paragraph ending "re-run the check before reporting.")
- Modify: `plugin/skills/flow/claim-targets.md:221` ("Confirming the manual MCP path actually landed" paragraph)
- Modify: `docs/plugin-structure.md:184`
- Test: `tests/dispatch-mechanical-enforcement.test.js`

- [ ] **Step 1: Write the failing test** — `#2912 AC1.1/AC3.1: the first-call template requires verify-run-bookends.js on every transport before DONE`: the text between `## First call — build,test` and `## Second call` of `task-prompt.md` matches `/verify-run-bookends\.js" --run "\{minted-run-dir\}" --targets \{comma-joined issue numbers\}/`, `/every transport/`, and `/build-test-blocked/`; `claim-targets.md` matches `/committed `work\/\{n\}-spec\.md`/` and `/canonical `Step 2\.8: claimed #\{n\}`/`.
- [ ] **Step 2: Run** `node --test tests/dispatch-mechanical-enforcement.test.js` — Expected: FAIL.
- [ ] **Step 3: Edit prose.** Insert into the fenced first-call template (dispatcher-voice: it is text the agent receives verbatim):

```
Bookends (every transport, #2912): before reporting `DONE`/`build-test-ok`, also run
`node "{plugin-root}/bin/verify-run-bookends.js" --run "{minted-run-dir}" --targets {comma-joined issue numbers}`.
Exit 0 is required. On exit 1, run each `missing` entry's `remedy` (committed spec, worktree
stamp, draft PR under pr-first, canonical `Step 2.8: claimed #{n}` line, live claim), then re-run
it; if it still exits 1, report `OUTCOME: build-test-blocked` / `STATUS: BLOCKED`, never `DONE`.
```

In `claim-targets.md` replace "confirming this run's `worktree`/`pr` stamps and a live claim per target" with "confirming this run's `worktree` stamp, its `pr` stamp under `pr-first` (resolved from the run pin, else `policy.yml`, else detection), a committed `work/{n}-spec.md`, a canonical `Step 2.8: claimed #{n}` line and a live claim per target", and add after that sentence: "Dispatch's first-call template requires the same check on every transport (#2912)." In `docs/plugin-structure.md:184` name the two new bookends.
- [ ] **Step 4: Run** `node --test tests/dispatch-mechanical-enforcement.test.js` plus every suite reading `task-prompt.md` or `claim-targets.md` (`git grep -l -e task-prompt.md -e claim-targets.md -- tests`) — Expected: PASS.
- [ ] **Step 5: Commit** — `Require the call-1 bookend check on every dispatch transport — refs #2912`.

### Task 4: Record the root cause and file the pin follow-up

- [ ] Append a `### Root cause (#2912)` section (the Trace above, condensed) to PR #3570's body after the `<!-- fixes-end -->` marker via `gh pr edit 3570 --body-file`, keeping every marker byte-identical.
- [ ] File a follow-up backlog record via `/claude-tweaks:capture`: `_shared/integration-model.md`'s "Run-scoped stability" says the run pins `integration-model` into `config.yml` at run start, but no writer does (`MANIFESTO_LEVERS` excludes it; 34 of 697 archived `config.yml` files carry the key, all hand-written) — Defer-reason: genuinely-larger (Manifesto contract change).
