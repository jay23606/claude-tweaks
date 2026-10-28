# E1 Merge-Finish Exemption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let E1 allow a `git commit` that concludes a merge of a run's branch, so a multi-run `local-merge` reconciliation's conflict-resolution commit no longer has to close sibling runs.

**Architecture:** A `MERGE_HEAD`-keyed live query in `runInner`'s E1 tail loop (`plugin/bin/lib/hooks/pre-tool-use.js`), placed immediately before the `wd-deny` return and applied to `commit` targets only: when every commit the target checkout's `MERGE_HEAD` lists equals the current `HEAD` of a run's worktree (a live run's `worktree`, or a closed run's `worktreeAtClose`), log `wd-merge-finish` to `ctx.runDir` and `continue`. Every inconclusive read keeps today's deny. Then the reconciliation prose drops its sibling-run chase.

**Tech Stack:** Node 18+ CommonJS, `node --test`, git CLI via `plugin/bin/lib/hooks/git-exec.js`'s `runGit`.

**Spec:** `.claude-tweaks/pipelines/2026-10-28T091512-record-3875/work/3875-spec.md` (record #3875)

Scope keywords: MERGE_HEAD, wd-merge-finish, to pass E1, E1 still denies

## Global Constraints

- **Premise correction (logged in the run's `decisions.md`):** the spec says match against live runs only (`ctx.runState.worktree` or `otherWorktrees`). `worktree-merge.md`'s Resolve-now bullet closes this branch's run *before* the resolution commit (kept per Deliverable 3 and the #3809 pins), and `close-run` nulls `worktree` and sets `status: clean` (keeping the path as `worktreeAtClose`, #3023). So the merged branch's run is never live at that commit. The candidate set is therefore: `ctx.runState.worktree` (→ `ctx.runDir`), every `otherWorktrees` entry, and every `status: clean` run's `worktreeAtClose` from `ctxLib.listRunDirsWithState(ctx.cwd, { status: 'clean' })`.
- **Placement:** inside the E1 target loop, after the foreign-ownership `return` and immediately before the `wd-deny` `appendEvent`, guarded by `target.action === 'commit'`. This keeps a commit already allowed by `otherWorktrees` from being reclassified (it `continue`s earlier) and keeps a `foreign` caller's existing allow + `systemMessage`.
- Event: `wd-merge-finish`, appended to `ctx.runDir` (E1's #1431 audit convention — every E1 event uses `ctx.runDir`), payload `{ expected: assigned, actual, mergedRunDirs, command: command.slice(0, 200) }` where `mergedRunDirs` is the de-duplicated array of run dirs whose worktree `HEAD` matched a `MERGE_HEAD` line.
- Governing skill `.claude/skills/pre-tool-use-gate-exemptions/SKILL.md`, quoted verbatim:
  - "**Every unprovable answer fails CLOSED, and a conclusive exemption is never gated on an unrelated inconclusive one.**"
  - "**Not every exemption is decidable from the command grammar alone — some need a live query.** … Keep the two steps in that order and don't let the grammar match alone stand in for the live check"
  - "**Every new exemption needs a regression test proven to go red on revert.** Write the test, revert only the code fix (`git checkout -- {file}` on that one file, not `git stash`), confirm the new test — and only the new test — fails, then restore the fix."
  - "Comparing `fs.realpathSync` output against a root or an exclusion … a new exemption that compares resolved paths does the same, resolving both sides through `canonicalRealpath()` / `resolveLeaf()` and never the JS `fs.realpathSync`" — a new bare `realpathSync` token in `pre-tool-use.js` fails `tests/path-guard-conformance.test.js`.
  - "A new gate returning a non-deny `hookSpecificOutput` … Keep a non-deny note in `systemMessage`" — this exemption returns nothing (it `continue`s), never a `hookSpecificOutput`.
  - E1 "never reads the scanner's `lost` marker" (#4303) — the exemption reads `actual` exactly as the surrounding loop does; no `lost` handling.
- Unprovable → no exemption (spec Deliverable 2): `git rev-parse --git-path MERGE_HEAD` fails; the file is missing/unreadable/empty; any line is not a 40- or 64-hex object id; any line matches no candidate `HEAD`; a candidate whose `canonicalRealpath` is null, whose toplevel does not equal itself, or whose `git rev-parse --verify HEAD` fails contributes no match; target action other than `commit`.
- Commit messages: `{Verb} {what} — {detail}` with `refs #3875`, never `closes`/`fixes`.

## Review Focus

1. A branch whose run's worktree was torn down before the resolution commit — `HEAD` unreadable must deny (pinned: Task 1 `removed worktree` case).
2. A worktree dir that still exists but is no longer a git worktree, nested inside another repo — `git -C dir rev-parse HEAD` would answer with the *enclosing* repo's `HEAD`; the toplevel-equals-self check must stop it (pinned: Task 1 `corrupt .git` case asserts deny).
3. Octopus `MERGE_HEAD` where only one line matches a run — must deny (pinned: Task 1 octopus case).
4. A `git push` or plumbing write (`update-ref`) while a matching merge is in progress — unaffected (pinned: Task 1 push and update-ref cases).
5. A reconciliation branch that has no run at all — no candidate matches, E1 may still deny; the prose must say what to do (Task 2 Resolve-now text: treat as abandoned and report).

---

### Task 1: MERGE_HEAD exemption in E1

**Role:** integration
**Review risk:** high

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js` (new helpers near `isIntegrationBranchFastForwardPush` ~line 425; E1 loop in `runInner` ~lines 2311-2374)
- Test: `tests/hooks-pre-tool-use.test.js` (append a block after the existing multi-run E1 tests, ~line 308; helpers `gitRepoWithCommit`/`linkedWorktreeOf` already exist at ~330 and are hoisted function declarations)

**Interfaces:**
- Consumes: `runGit(args, cwd)` from `./git-exec` (returns `{ stdout, failure }`); `canonicalRealpath(p, { fsImpl })`; `ctxLib.listRunDirsWithState(cwd, opts)` (yields `{ dir, state }`; `{ status: 'clean' }` yields only clean runs); `ctxLib.appendEvent(runDir, type, payload)`; E1's existing locals `assigned`, `otherWorktrees`, `topOf`, `fsImpl`, `actual`, `command`.
- Produces (module-private, not exported):
  - `readMergeHeads(repoDir: string) -> string[] | null`
  - `mergeFinishRunDirs(actual: string, candidates: Array<{ worktree: string, runDir: string }>, topOf: (dir) => string|null, fsImpl) -> string[] | null` — the de-duplicated matched run dirs, or `null` when unprovable.

- [ ] **Step 1: Write the failing tests**

Add a fixture helper and eight tests. Fixture (one function, `mergeFixture({ siblingClosed = false } = {})`):
- `main = gitRepoWithCommit()`; `siblingWt = linkedWorktreeOf(main)`; `newerWt = linkedWorktreeOf(main)`; `siblingBranch` = `git -C siblingWt branch --show-current`; `git -C siblingWt commit --allow-empty -q -m sib`.
- `project = tmpProject()`; sibling run `mkRunAt(project, '2026-07-01T090000-spec-1', siblingWt)`; when `siblingClosed`, overwrite its `run-state.json` with `{ status: 'clean', worktree: null, worktreeAtClose: siblingWt }`; `newer = mkRunAt(project, '2026-07-02T090000-spec-2', newerWt)` (the resolved run).
- Returns `{ main, siblingWt, siblingBranch, project, newer, siblingRun }`.
- Each test calls `pre.run({ input: bashInput(cmd, project), runDir: newer.run, runState: newer.state, cwd: project })` with `cmd` targeting `main` via ``git -C ${shellQuote(main)} …``. `events(run)` reads `events.jsonl` or `''` when absent.

Tests (names verbatim):
1. `#3875: a merge-finish commit whose MERGE_HEAD is a live sibling run's worktree HEAD is allowed and logs wd-merge-finish on the resolved (newer) run` — `git -C main merge --no-commit --no-ff -q {siblingBranch}`; `commit --no-edit` → `assert.deepStrictEqual(out, {})`; `events(newer.run)` matches `/"type":"wd-merge-finish"/` and contains `siblingRun` (escaped); does not match `/"type":"wd-deny"/`.
2. `#3875: the same commit is allowed when the merged branch's run was closed first (worktreeAtClose), the reconciliation's own shape` — `mergeFixture({ siblingClosed: true })`, same assertions.
3. `#3875: with no merge in progress (no MERGE_HEAD) the commit is still denied` — no merge; `permissionDecision === 'deny'`; no `wd-merge-finish`.
4. `#3875: a MERGE_HEAD naming a commit that is no run's worktree HEAD is still denied` — in `main`: `git -C main checkout -q -b other`, `git -C main commit --allow-empty -q -m o`, `git -C main checkout -q -` (back to the default branch), then `git -C main merge --no-commit --no-ff -q other` → deny, no `wd-merge-finish`.
5. `#3875: an octopus MERGE_HEAD with one line matching no run is still denied` — build `other` as in 4, then `git -C main merge --no-commit --no-ff -q {siblingBranch} other`; assert `MERGE_HEAD` (read via `git -C main rev-parse --git-path MERGE_HEAD`, resolved against `main`) has 2 lines; deny; no `wd-merge-finish`.
6. `#3875: a matching run whose worktree HEAD cannot be read is still denied (removed worktree, corrupt .git)` — two sub-cases in one test, each on a fresh fixture after the merge has started: (a) `git -C main worktree remove --force siblingWt`; (b) `fs.writeFileSync(path.join(siblingWt, '.git'), 'gitdir: /nonexistent\n')`. Each → deny, no `wd-merge-finish`.
7. `#3875: a git push during a matching merge is unaffected (logs wd-push-mismatch, never wd-merge-finish)` — merge as in 1; `git -C main push origin main` → `{}`; events match `wd-push-mismatch`, not `wd-merge-finish`.
8. `#3875: a non-commit write (update-ref) during a matching merge is still denied` — merge as in 1; `git -C main update-ref refs/heads/x HEAD` → deny; no `wd-merge-finish`.

Git calls in the fixture use `execFileSync('git', ['-C', dir, ...])`, as the file's existing helpers do.

- [ ] **Step 2: Run the tests to verify the allow cases fail**

Run: `node --test --test-name-pattern="#3875" tests/hooks-pre-tool-use.test.js`
Expected: FAIL on tests 1 and 2 (deny returned, no `wd-merge-finish`); tests 3-8 PASS (they pin today's verdict).

- [ ] **Step 3: Implement `readMergeHeads` and `mergeFinishRunDirs` in `plugin/bin/lib/hooks/pre-tool-use.js`**

- `readMergeHeads(repoDir)`: `runGit(['rev-parse', '--git-path', 'MERGE_HEAD'], repoDir)`; on `failure` or empty stdout → `null`. `path.resolve(repoDir, stdout)` (a main checkout prints a path relative to `repoDir`, a linked worktree an absolute one). Read it with `fs.readFileSync(…, 'utf8')` in a `try` (any throw → `null`); the path comes from a real git query, so the real `fs` is the consistent reader here — say so in a one-line comment. Split on `/\r?\n/`, trim, drop empty lines; zero lines, or any line not matching `/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/` → `null`.
- `mergeFinishRunDirs(actual, candidates, topOf, fsImpl)`: `heads = readMergeHeads(actual)`, `null` → `null`. For each candidate compute its `HEAD` at most once (cache): `canonicalRealpath(topOf(worktree), { fsImpl }) === worktree` else no `HEAD`; then `runGit(['rev-parse', '--verify', 'HEAD'], worktree)`, `failure` → no `HEAD`. Every `heads` line must equal some candidate's `HEAD`, else `null`. Return the de-duplicated matched `runDir`s.
- In `runInner`: build the candidate list lazily (a closure called only on the exemption path): `{ worktree: assigned, runDir: ctx.runDir }`, then each `otherWorktrees` `[real, dir]`, then each clean run from `ctxLib.listRunDirsWithState(ctx.cwd, { status: 'clean' })` whose `state.worktreeAtClose` is a string, canonicalized with `canonicalRealpath(…, { fsImpl })`, skipping `null` and worktrees already listed.
- In the target loop, after the `ownershipVerdict === 'foreign'` block and before the `wd-deny` `appendEvent`: when `target.action === 'commit'` and `mergeFinishRunDirs(actual, candidates(), topOf, fsImpl)` returns an array, `ctxLib.appendEvent(ctx.runDir, 'wd-merge-finish', { expected: assigned, actual, mergedRunDirs, command: command.slice(0, 200) })` and `continue`.
- Comment the block with the #3875 rationale in two or three lines (MERGE_HEAD a run's tip ⇒ that branch being integrated; closed runs included because the reconciliation closes the merged branch's run first; every unprovable read keeps the deny). Update the `#1431 audit` comment's event list to include `wd-merge-finish`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hooks-pre-tool-use.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Run the adjacent conformance suites**

Run: `node --test tests/path-guard-conformance.test.js tests/path-containment-conformance.test.js tests/hooks-run-attribution.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js tests/hooks-pre-tool-use.test.js
git commit -m "Let E1 allow a commit concluding a run branch's merge — MERGE_HEAD live query, wd-merge-finish (refs #3875)"
```

- [ ] **Step 7: Prove the allow tests discriminate**

`git checkout HEAD~1 -- plugin/bin/lib/hooks/pre-tool-use.js`, run `node --test --test-name-pattern="#3875" tests/hooks-pre-tool-use.test.js` → tests 1 and 2 FAIL, 3-8 PASS; restore with `git checkout HEAD -- plugin/bin/lib/hooks/pre-tool-use.js` and confirm `git status --porcelain` is empty. Quote the raw failing/passing counts in the report.

---

### Task 2: Drop the reconciliation's E1 chase and document the exemption

**Role:** integration

**Files:**
- Modify: `plugin/skills/flow/worktree-merge.md:44` (E1 description paragraph), `:125` (Resolve-now bullet), `:137` (abandoned clause) — 18,316 B now, far under the 52,500 B rail.
- Modify: `docs/hooks.md` — new bullet directly after the "**Ambiguity resolves to allow**" bullet (line 8).
- Modify: `docs/journeys/reconcile-local-merge-branches-from-several-terminals-3809.md:44-45` (step 4's Should understand / Red flags).
- No change (checked): `wrap-up/auto-merge-short-circuit.md`, `dispatch/settle-and-merge.md`, `_shared/local-merge-auto-finish.md` — each closes only its own branch's run before a conflict-free merge; no sibling chase.
- Test (existing, unchanged): `tests/local-merge-close-run-ordering.test.js`

**Interfaces:**
- Consumes: Task 1's behavior and event name `wd-merge-finish`; the candidate-set rule in Global Constraints.

- [ ] **Step 1: Edit `worktree-merge.md`**
  - Line 44: keep the first sentence's list and add the new allowed case — a commit concluding a merge whose every `MERGE_HEAD` line is the current `HEAD` of a run's worktree (a live run's, or a closed run's last one; `docs/hooks.md`). Replace the last sentence ("The conflict path's resolution ends in a commit, which a still-assigned run can block — so a branch's run is closed before its conflict is resolved (step 5 below).") with: the conflict path's resolution commit concludes that branch's merge, so E1 allows it even after step 3 closed the branch's run; no other branch's run is closed for it (step 5 below).
  - Line 125: keep verbatim from "**Resolve now** → this branch's run is closed first" through "so it must be closed again)." and the closing sentence "\"The resolution lands\" means …". Replace everything between with: the resolution ends in a commit that concludes the merge of `{branch}`; E1 allows it because its `MERGE_HEAD` is the `HEAD` of this branch's run's worktree, so no other branch's run is closed. If E1 still denies it (the merge could not be proven — this branch has no run, or its worktree is gone or no longer at `{branch}`'s tip), treat the resolution as abandoned (below) and report the deny.
  - Line 137: keep "re-protect every run closed for it" (pinned by AC3) and replace "— this branch's and every run closed to pass E1." with "— this branch's run (**Re-protect** below)."

- [ ] **Step 2: Add the `docs/hooks.md` bullet**

`- **Merge-finish exemption (#3875):**` E1 allows a `git commit` (only `commit` — a push, `update-ref` or other write keeps its verdict) whose checkout has a merge in progress and whose every `MERGE_HEAD` line equals the current `HEAD` of a run's worktree: `ctx.runState.worktree`, any other live run's, or a closed run's `worktreeAtClose` (a local-merge reconciliation closes the merged branch's run before its conflict-resolution commit). It logs `wd-merge-finish` (`expected`, `actual`, `mergedRunDirs`) to `ctx.runDir`. It is a live query, never a marker: git removes `MERGE_HEAD` when the merge concludes or aborts. Every inconclusive read denies as before — no readable `MERGE_HEAD`, a line matching no run's `HEAD` (an octopus merge must match on every line), a worktree whose toplevel is not itself or whose `HEAD` cannot be read. It sits after the foreign-session branch, so a foreign caller keeps its allow + `systemMessage`.

- [ ] **Step 3: Update the journey's step 4**

Should understand: replace the "If the hook still denies that commit because another branch's run … that run is reported." sentences with: the hook allows that commit because it concludes this branch's merge, so no other branch's run is ever closed for it; if the hook still denies it, the resolution counts as abandoned, this branch's run is re-protected, and the deny is reported. Red flags: replace "the reconciling session closing a run that isn't part of this reconciliation" with "the reconciling session closing any other branch's run to get the resolution commit through".

- [ ] **Step 4: Verify pins and the sweep**

Run: `node --test tests/local-merge-close-run-ordering.test.js tests/merge-subject-composer-conformance.test.js tests/merge-verification-gate-conformance.test.js tests/pr-first-merge.test.js`
Expected: PASS.
Run: `grep -rn "to pass E1\|E1 still denies that commit\|next-newest live run" plugin docs/journeys`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/flow/worktree-merge.md docs/hooks.md docs/journeys/reconcile-local-merge-branches-from-several-terminals-3809.md
git commit -m "Drop the reconciliation's E1 chase — document the merge-finish exemption (refs #3875)"
```
