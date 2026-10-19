# Ledger Probe Ownership Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ledgerProbe` in `plugin/bin/lib/wrap-up/pack.js` counts only the `docs/plans/*-ledger.md` files this run's branch owns, and lists inherited ones separately as `unattributedFiles`.

**Architecture:** Ownership is derived through the probe's existing injectable `deps.git` seam: a ledger is owned when `git diff --name-only -z --relative {base} -- docs/plans/` (merge base vs. working tree — covers committed, staged and unstaged changes to tracked files, i.e. the spec's `{merge-base}...HEAD` diff plus `git status`'s modified half) or `git ls-files --others --exclude-standard -z -- docs/plans/` (untracked — `git status`'s `??` half) names it. `namesRecord` becomes a tie-break among owned candidates only. The `{run-dir}/ledger.md` branch is untouched.

**Tech Stack:** Node 18+, `node --test`, no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T070540-record-2887/work/2887-spec.md`

Scope keywords: ledgerProbe

## Global Constraints

- `{run-dir}/ledger.md`, when present, still takes precedence with unchanged output (no new key on that branch).
- Unattributed candidates are never summed into `open` or `total`.
- `npm test` passes in full.

## Review Focus

- **Merge base unavailable (`inputs.base === null`) while candidates exist** — ownership is unknowable; the probe must fail (`ok: false`, error naming the merge base), never report a silent zero that would let wrap-up's ledger gate pass on "nothing open". Test: `ownership unknowable without a merge base fails the probe`.
- **A git ownership command throws** (not a repo, git missing) — same: probe fails with the git error, never a silent zero. Test: `a failing ownership git call fails the probe`.
- **No candidates at all** — returns zeros without calling git (keeps `pack-cli.test.js`'s "pure fs probe still succeeds" case green, whose fixture repo has no `docs/plans/`). Test: `no docs/plans ledgers reports zeros without consulting git`.
- **Uncommitted (untracked) ledger** — this run's ledger written but not yet committed is still owned (spec Gotcha 1). Test: `an untracked ledger in the worktree counts as owned`.
- **Two owned ledgers, one naming a record** — tie-break keeps the named one; the other is listed under `unattributedFiles`, not dropped silently. Test: `two owned ledgers tie-break on namesRecord`.

---

### Task 1: Ownership-based ledger attribution

**Files:**
- Modify: `plugin/bin/lib/wrap-up/pack.js:381-449` (`namesRecord` comment, `ledgerProbe`)
- Test: `tests/bin-lib/wrap-up/pack.test.js:613-768` (ledger tests) and `:844-865` (archived-ledger race test)
- Read-only check: `plugin/skills/_shared/ledger-format.md` Location section ("one ledger per pipeline run" still holds); `tests/bin-lib/wrap-up/pack-cli.test.js:104-115` stays green unmodified (no `docs/plans/` in its fixture).

**Interfaces:**
- Consumes: `inputs.base` (merge-base sha or `null`), `inputs.worktree`, `inputs.records`, `inputs.runDir`; `deps.git(args, { cwd })` → stdout string (throws on failure).
- Produces: `ledgerProbe(inputs, deps)` returns, on the docs/plans branch, `{ open, total, byPhase, files, unattributedFiles, unrecognized, unrecognizedValues }` where `files` and `unattributedFiles` are `docs/plans/{name}` posix paths, sorted as `readdir` returns them. Run-dir branch unchanged: `{ ...parseLedger(text), files: ['ledger.md'] }`.

- [ ] **Step 1: Add a test helper and write the failing tests**

In `tests/bin-lib/wrap-up/pack.test.js`, add `ownedGit(owned = [], untracked = [])` returning a `deps.git` fake: `merge-base` → `'abc123\n'`, `rev-parse` → `'refs/remotes/origin/main\n'`, `diff` → `owned.join('\0')`, `ls-files` → `untracked.join('\0')` (entries are `docs/plans/{name}` paths), else `''`. Add a helper `treeWithLedgers(files)` (writes each `{name: text}` under a temp `docs/plans/`, returns `{ tree, runDir }` with `run-state.json.worktree = tree`), reusing the existing inline pattern.

New/rewritten tests (assert exact values):

- `AC1.1: a worktree holding one ledger inherited from the merge base reports open 0, total 0 and lists it as unattributed` — one file `2026-10-03-record-2853-ledger.md` with an `open` row, `ownedGit([])`: `value.open === 0`, `value.total === 0`, `value.files` `[]`, `value.unattributedFiles` `['docs/plans/2026-10-03-record-2853-ledger.md']`, `value.byPhase` `{}`.
- `AC1.1: several inherited ledgers with none owned report zero and list every one as unattributed` — two inherited files with open rows: same zeros; `unattributedFiles` sorted equals both paths.
- `AC2.1: one ledger added on the branch plus inherited ledgers counts only the added ledger's items` — replaces the existing `two topic-slug ledgers where neither names the record falls back to counting both` test (same two files; the `harness-health…` one is owned): `open === 2`, `total === 2`, `files` = owned path only, `unattributedFiles` = the stray path.
- `an untracked ledger in the worktree counts as owned` — `ownedGit([], ['docs/plans/x-ledger.md'])`: counted, `files` = that path.
- `two owned ledgers tie-break on namesRecord` — rewrite of the `#1930 review M5` test: both files owned, record 26: `files` = `['docs/plans/2025-01-02-spec-26-ledger.md']`, `total === 1`, `unattributedFiles` = `['docs/plans/2026-09-05-spec-99-ledger.md']`.
- `ownership unknowable without a merge base fails the probe` — deps git `merge-base` throws (so `inputs.base` is null), one ledger present: `pack.ledger.ok === false`, `pack.ledger.error` matches `/merge base/`.
- `a failing ownership git call fails the probe` — `diff` throws `new Error('git down')`: `ok === false`, error matches `/git down/`.
- `no docs/plans ledgers reports zeros without consulting git` — empty `docs/plans/`, git fake records calls: `value` deep-equals `{ open: 0, total: 0, byPhase: {}, files: [], unattributedFiles: [], unrecognized: 0, unrecognizedValues: [] }`; no recorded call with `args[0]` of `diff` or `ls-files`.
- `AC3.1: {run-dir}/ledger.md is authoritative …` (existing #2563 AC4 test) — additionally assert `!Object.prototype.hasOwnProperty.call(pack.ledger.value, 'unattributedFiles')`.

Existing tests that must keep counting their file: pass `ownedGit([...their docs/plans paths])` as `git` in `okDeps({...})` for the `#1930` count test (its `deepStrictEqual` gains `unattributedFiles: []` — return-shape widening), both `#2080` tests, the `#2563 AC1` topic-slug test, and the archived-between-readdir-and-read race test (both files owned; still `total === 1`).

Waived AC4.1: `npm test` passing is verified by the build's Common Step 5 full run, not a unit test.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --test tests/bin-lib/wrap-up/pack.test.js`
Expected: FAIL after Step 1 — `AC1.1`, `AC2.1`, untracked, tie-break, merge-base and git-failure tests fail (current code counts unowned files / never calls git).

- [ ] **Step 3: Implement ownership attribution in `ledgerProbe(inputs, deps)`**

Order: run-dir branch unchanged → `candidates` from `readdir` → if `candidates.length === 0` return the zero shape (with `unattributedFiles: []`) without calling git → if `inputs.base` is falsy throw `new Error('ledger: merge base unavailable — cannot attribute docs/plans ledgers to this run')` → `owned` = set of basenames from the two git calls above (cwd `inputs.worktree`; split stdout on `\0`, drop empties, keep entries starting `docs/plans/` whose remainder has no `/`) → `ownedCandidates = candidates.filter(owned.has)` → if `ownedCandidates.length > 1` and some name a record via `namesRecord`, `files` = those, else `files = ownedCandidates` → `unattributedFiles` = `candidates` minus `files`. Let git errors propagate (the probe envelope turns them into `ok: false`). Sum only `files`. Rewrite the comment blocks at `:381-389` and `:409-428` to describe ownership-by-diff and why the #2563 over-count fallback is gone (ownership removes the hide-vs-overcount dilemma).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/wrap-up/pack.test.js tests/bin-lib/wrap-up/pack-cli.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Real-input probe**

Run (from this worktree): `node plugin/bin/wrap-up-pack.js --run "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-10-19T070540-record-2887" --only ledger --json "{scratchpad}/ledger-probe.json"` then read `ledger.value`.
Expected: `files` = `['docs/plans/2026-10-19-record-2887-ledger.md']`, `unattributedFiles` = the two inherited ledgers (`2026-10-17-spec-3376-3386-ledger.md`, `2026-10-18-capture-argument-hint-producer-flags-ledger.md`), `open`/`total` equal to this run's own ledger row counts. Independent count: `ls docs/plans/ | grep -c -- '-ledger.md$'` must equal `files.length + unattributedFiles.length` (3 at authoring time).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/wrap-up/pack.js tests/bin-lib/wrap-up/pack.test.js
git commit -m "Attribute wrap-up ledger probe by branch ownership — refs #2887"
```
