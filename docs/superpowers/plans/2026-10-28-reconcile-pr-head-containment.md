# Reconcile PR-Head Containment Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let reconcile's `archive-branches` (local) and `remote-prune` (remote) checks delete a plugin-owned branch whose tip equals, or is an ancestor of, its MERGED PR's `headRefOid`. This becomes a third merged-in-substance proof beside cherry-equivalence and squash provenance.

**Architecture:** The new proof module `plugin/bin/lib/reconcile/pr-head-containment.js` exports `isPrHeadContained(root, integration, branch, prState)`. It reads only GitHub facts (`state`, `baseRefName`, `headRefOid` from the per-branch confirm) plus a local ancestry check between the branch tip and `headRefOid`. It deliberately does **not** consult the local integration ref. Measured on this machine (2026-10-28): the local `main` had diverged from `origin/main` because it carries local-only `[reconcile] archive run` commits, so `mirror-ff`'s `--ff-only` cannot move it. Real merged branch `worktree-dispatch-record-4459` (PR #4516, tip `21b841cf…` == `headRefOid`) therefore fails `git cherry` and fails `isSquashMerged` condition (b), because its squash commit `9c2bf21a…` is not on local `main`. That is the gap this record closes. The per-branch `resolvePrState` gains `headRefOid,baseRefName`, and the batch head answers gain the same two fields to keep the batch's "same shape as the per-item call" contract.

**Tech Stack:** Node 18+ CommonJS, `node --test`, git CLI via `runGit` (`plugin/bin/lib/hooks/git-exec.js`), gh CLI.

**Spec:** `.claude-tweaks/pipelines/2026-10-28T224130-record-4463/work/4463-spec.md` (record #4463)

## Global Constraints

- Never a false delete: every unknown, malformed, or git-failure input resolves the proof to `false` (skip). The proof is boolean, never null, like `isSquashMerged`.
- A MERGED PR is required (`prState.state === 'MERGED'`), and so is `prState.baseRefName === integration`: the PR landed on the integration branch per GitHub. Added beyond the record's text as a conservative guard; every observed real case has base `main`.
- `headRefOid` must match `/^[0-9a-f]{40}$/` before any git call.
- Ordering inside both decision tables is unchanged: transport failure → OPEN → cherry → (archive only: nothingLanded/age) → squash → **pr-head-contained** → final skip. The new proof never outranks OPEN or a missing merged PR.
- New reason strings (exact): archive-branches delete reason `pr-head-contained`; remote-prune delete reason `merged-pr-head-contained`. Existing reasons keep their names: `not-proven-merged` (remote-prune: none of the three proofs) and `merged-pr-without-cherry-equivalence` (archive-branches: none of the three proofs).
- All git through `runGit`, never a raw `execFileSync` (the `subprocess-timing-conformance` suite scans this directory).

Waived plugin/bin/lib/reconcile/squash-provenance.js: read only. The spec names it as a "neighbouring proof to extend or reuse". The new proof shares none of its git logic and asks a different question (tip-in-head, not squash-tree reproduction), so it lives in a sibling module rather than overloading a file named for squash merges.

## Review Focus

1. A branch that gained a commit after its PR merged (tip not contained in `headRefOid`) is never deleted by this proof. Pinned in Task 2, Task 3 and Task 4.
2. `headRefOid` names an object this checkout never fetched, and tip ≠ head: `merge-base --is-ancestor` fails, so the proof is `false` and the branch is kept. Pinned in Task 2.
3. A PR merged into a non-integration base (stacked PR) gives no proof. Pinned in Task 2.
4. A bulk-screen-shaped or cached `prState` with no `headRefOid` (or a malformed one) gives no proof and spawns no git call. Pinned in Task 2.
5. A `prHeadContained: true` flag paired with a null/CLOSED/OPEN `prState` in the decision tables keeps today's age/pr-open/no-merged-pr outcome (F4 guard parity with `squashMerged`). Pinned in Task 3 and Task 4.

---

### Task 1: The per-branch PR state carries `headRefOid` and `baseRefName`

**Role:** integration

**Files:**
- Modify: `plugin/bin/lib/reconcile/pr-state.js:36` (`PR_LIST_ARGS`)
- Modify: `plugin/bin/lib/reconcile/pr-state-batch.js` (head alias selection in `buildBatchQuery`, head reshape in `parseBatchResponse`/`reshapeNode`, header comment)
- Test: `tests/bin-lib/reconcile/pr-state.test.js`
- Test: `tests/bin-lib/reconcile/pr-state-batch.test.js`

**Interfaces:**
- Produces: `resolvePrState(root, branch[, opts])` / `resolvePrStateAsync` return objects that now also carry `headRefOid: string` and `baseRefName: string`. `PR_VIEW_JSON_FIELDS` (by-number) is unchanged. The batch `byHead` answers carry the same two fields; `byNumber` answers do not (parity with `gh pr view`'s field list).

- [ ] **Step 1: Write the failing tests**

In `pr-state.test.js`, copy the argv-log wrapper pattern of the existing `resolvePrStateByNumber: requests and returns mergeable/mergeStateStatus (#2367)` test:

```js
test('resolvePrState: requests and returns headRefOid/baseRefName (#4463)', { skip: STUB_SKIP }, () => {
  // wrapper gh echoes argv to a log, prints [ { number: 7, state: 'MERGED', ..., headRefOid: 'a'.repeat(40), baseRefName: 'main' } ]
  const result = resolvePrState(REPO_ROOT, 'build/x');
  assert.equal(result.headRefOid, 'a'.repeat(40));
  assert.equal(result.baseRefName, 'main');
  assert.match(argv, /headRefOid/);
  assert.match(argv, /baseRefName/);
});
```

In `pr-state-batch.test.js`:

```js
test('buildBatchQuery: head selection carries headRefOid/baseRefName, by-number selection does not (#4463)', () => {
  const q = buildBatchQuery({ numbers: [4145], heads: ['h'] });
  const headPart = q.slice(q.indexOf('h0:'));
  const numberPart = q.slice(q.indexOf('n0:'), q.indexOf('h0:'));
  assert.ok(headPart.includes('headRefOid') && headPart.includes('baseRefName'), q);
  assert.ok(!numberPart.includes('headRefOid') && !numberPart.includes('baseRefName'), q);
});
test('parseBatchResponse: a head answer carries headRefOid/baseRefName like gh pr list --head (#4463)', () => {
  // h0 node = { ...headNode(10, 'MERGED', ...), headRefOid: 'b'.repeat(40), baseRefName: 'main' }
  assert.equal(picked.headRefOid, 'b'.repeat(40));
  assert.equal(picked.baseRefName, 'main');
});
```

Also add `assert.equal('headRefOid' in byNumber.get(3992), false)` to the existing by-number reshape test: the by-number shape stays the `gh pr view` shape.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/bin-lib/reconcile/pr-state.test.js tests/bin-lib/reconcile/pr-state-batch.test.js`
Expected: FAIL after Step 1. The new assertions fail on the missing `headRefOid`.

- [ ] **Step 3: Implement**

`PR_LIST_ARGS` `--json` becomes `number,state,mergedAt,updatedAt,mergeCommit,closingIssuesReferences,headRefOid,baseRefName`. In `pr-state-batch.js`, the `h{i}` alias's `nodes{ … }` selection appends `headRefOid baseRefName` (not added to the shared `PR_FIELDS`, so `n{i}` aliases are unchanged). The head reshape copies `headRefOid` and `baseRefName` from the governing node; the by-number reshape does not. Update the header comment's parity sentence to name the two fields.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/bin-lib/reconcile/pr-state.test.js tests/bin-lib/reconcile/pr-state-batch.test.js tests/bin-lib/reconcile/pr-state-cache.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/pr-state.js plugin/bin/lib/reconcile/pr-state-batch.js tests/bin-lib/reconcile/pr-state.test.js tests/bin-lib/reconcile/pr-state-batch.test.js
git commit -m "Carry headRefOid/baseRefName on the per-branch PR state — refs #4463"
```

### Task 2: `isPrHeadContained` proof module

**Role:** integration
**Review risk:** high

**Files:**
- Create: `plugin/bin/lib/reconcile/pr-head-containment.js`
- Test: `tests/bin-lib/reconcile/pr-head-containment.test.js`

**Interfaces:**
- Consumes: the Task 1 `prState` shape (`state`, `baseRefName`, `headRefOid`); `runGit` from `../hooks/git-exec`.
- Produces: `isPrHeadContained(root: string, integration: string, branch: string, prState: object|null|string) -> boolean`, exported as `module.exports = { isPrHeadContained }`. `branch` is any ref git resolves: a local branch name for archive-branches, `origin/{branch}` for remote-prune.

- [ ] **Step 1: Write the failing tests**

Fixture `makeFixture()`: a temp repo with `main` at `init` and `build/two` holding two commits (`first`, `second`) off `init`. `main` is **not** advanced, which models the real diverged-local-main shape. Helper `merged(head, base = 'main') => ({ number: 7, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', mergeCommit: { oid: 'e'.repeat(40) }, headRefOid: head, baseRefName: base })`.

```js
test('isPrHeadContained: tip equals the merged PR head -> true, with integration not carrying the merge (#4463 real shape)', ...);
  // assert.strictEqual(isPrHeadContained(dir, 'main', 'build/two', merged(tip)), true)
test('isPrHeadContained: tip is a strict ancestor of the merged PR head -> true', ...);
  // `git branch build/later build/two`, one more commit on build/later; head = build/later tip
test('isPrHeadContained: branch gained a commit after the PR head -> false', ...);
  // head = build/two~1 (the first commit); tip has `second` beyond it
test('isPrHeadContained: head object unknown locally and tip != head -> false, fail safe', ...);
  // merged('f'.repeat(40))
test('isPrHeadContained: PR merged into a non-integration base -> false', ...);
  // merged(tip, 'develop')
test('isPrHeadContained: non-MERGED, missing/malformed headRefOid, or transport prState -> false', ...);
  // { ...merged(tip), state: 'CLOSED' } / 'OPEN'; { number: 7, state: 'MERGED', baseRefName: 'main' } (screen shape);
  // headRefOid 'abc'; headRefOid tip.toUpperCase(); null; 'gh-absent'; 'network-failure'
test('isPrHeadContained: unknown branch ref -> false', ...);
  // isPrHeadContained(dir, 'main', 'no-such-branch', merged(tip))
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/bin-lib/reconcile/pr-head-containment.test.js`
Expected: FAIL with `Cannot find module '…/pr-head-containment'`.

- [ ] **Step 3: Implement `isPrHeadContained` in `plugin/bin/lib/reconcile/pr-head-containment.js`**

The guards run in this order and return `false` on the first miss: `prState` is an object with `state === 'MERGED'`; `baseRefName === integration`; `headRefOid` matches `/^[0-9a-f]{40}$/`. Then resolve the tip with `runGit(['rev-parse', '--verify', '--end-of-options', `${branch}^{commit}`], root)`; a failure or empty stdout returns `false`. If tip === `headRefOid`, return `true` (no object lookup needed). Otherwise return `!runGit(['merge-base', '--is-ancestor', tip, headRefOid], root).failure`, so exit 1 (not an ancestor) and exit 128 (unknown object) are both `false`. The header comment must state:
- what the proof is;
- why it does not consult the local integration ref (the diverged-local-main measurement above);
- that the deleted commits stay recoverable at `refs/pull/N/head`;
- that it is the third proof beside `isCherryEquivalent` and `isSquashMerged`.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test tests/bin-lib/reconcile/pr-head-containment.test.js tests/bin-lib/reconcile/subprocess-timing-conformance.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/pr-head-containment.js tests/bin-lib/reconcile/pr-head-containment.test.js
git commit -m "Add PR-head containment merged proof — refs #4463"
```

### Task 3: archive-branches accepts the PR-head containment proof

**Role:** integration
**Review risk:** high

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-branches.js` (header comment, `decideArchive`, the per-branch confirm block in `archiveBranches`, the `squashCandidate` routing comment)
- Test: `tests/bin-lib/reconcile/archive-branches.test.js`

**Interfaces:**
- Consumes: `isPrHeadContained` (Task 2).
- Produces: `decideArchive({ branch, tipAgeDays, cherryEquivalent, squashMerged = false, prHeadContained = false, prState })`, which returns `{ action: 'delete', reason: 'pr-head-contained' }` when only this proof holds against a MERGED `prState`.

- [ ] **Step 1: Write the failing tests**

Decision-table tests:

```js
test('decideArchive: pr-head-contained (neither cherry nor squash) + merged PR -> delete, reason pr-head-contained (#4463)', () => {
  const r = decideArchive({ branch: 'build/x', tipAgeDays: 2, cherryEquivalent: false, squashMerged: false, prHeadContained: true, prState: { number: 3, state: 'MERGED' } });
  assert.strictEqual(r.action, 'delete');
  assert.strictEqual(r.reason, 'pr-head-contained');
  assert.strictEqual(decideArchive({ ..., prHeadContained: true, prState: { number: 3, state: 'OPEN' } }).reason, 'pr-open');
});
test('decideArchive: prHeadContained:true with a null or CLOSED prState still takes the age rules (F4 parity)', () => {
  // tipAgeDays: 2 -> reason 'too-young' for prState null and for { state: 'CLOSED' }
});
```

Integration tests, using `makeRepo()` and the existing `screenMerged` stub. Fixture: `build/contained` with two commits off `init`; local `main` is **not** advanced (the real diverged shape, so cherry and squash both fail); the confirm returns `{ number: 1, state: 'MERGED', …, mergeCommit: { oid: 'e'.repeat(40) }, headRefOid: <build/contained tip>, baseRefName: 'main' }`:

```js
test('archiveBranches AC1.1: branch whose tip equals its merged PR head is deleted (reason pr-head-contained, no tag)', ...);
  // entry.action 'delete', entry.reason 'pr-head-contained'; branch gone; `git tag --list 'archive/*'` empty
test('archiveBranches: branch that gained a commit after its PR head -> skip merged-pr-without-cherry-equivalence, branch kept (#4463)', ...);
  // headRefOid = build/contained~1
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js`
Expected: FAIL after Step 1. The new tests report reason `merged-pr-without-cherry-equivalence` instead of `pr-head-contained`.

- [ ] **Step 3: Implement**

In `decideArchive`, add a `prHeadContained = false` parameter. Directly after the `squashMerged` clause, add `if (prHeadContained) return { action: 'delete', reason: 'pr-head-contained' };`, still below `nothingLanded`, and update the "Exhaustive (order: …)" comment. In `archiveBranches`, after `squashMerged` is computed, compute `const prHeadContained = cherryEquivalent || squashMerged ? false : isPrHeadContained(root, integration, branch, prState);` and pass it to `decideArchive`. Update the module header and the `squashCandidate` comment: the routing now feeds both confirm-only proofs. Do not rename the variable.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/archive-branches.js tests/bin-lib/reconcile/archive-branches.test.js
git commit -m "archive-branches: accept PR-head containment as merged proof — refs #4463"
```

### Task 4: remote-prune accepts the PR-head containment proof

**Role:** integration
**Review risk:** high

**Files:**
- Modify: `plugin/bin/lib/reconcile/prune-remote.js` (header comment, `decideRemotePrune`, the confirm block in `pruneRemote`)
- Test: `tests/bin-lib/reconcile/prune-remote.test.js`

**Interfaces:**
- Consumes: `isPrHeadContained` (Task 2), called with `` `origin/${branch}` ``.
- Produces: `decideRemotePrune({ branch, cherryEquivalent, squashMerged = false, prHeadContained = false, prState })`. It skips `not-proven-merged` only when none of the three proofs holds, and its delete reason is `merged-pr-cherry-equivalent`, then `merged-pr-squash-merged`, then `merged-pr-head-contained`, in that precedence.

- [ ] **Step 1: Write the failing tests**

```js
test('decideRemotePrune: merged PR + pr-head-contained only -> delete, reason merged-pr-head-contained (#4463)', ...);
test('decideRemotePrune: pr-head-contained never outranks OPEN or a missing merged PR', ...);
  // OPEN -> 'pr-open'; prState null -> 'no-merged-pr'; CLOSED -> 'no-merged-pr'
```

Integration tests use `makeRepoWithOrigin()` and `permissiveScreen`. Push `build/contained` (two commits) to origin, then delete the local branch; local `main` is not advanced. The confirm returns MERGED with `headRefOid` = the pushed tip, `baseRefName: 'main'`, and `mergeCommit: { oid: 'e'.repeat(40) }`:

```js
test('pruneRemote AC1.1: remote branch whose tip equals its merged PR head is deleted on origin (merged-pr-head-contained)', ...);
  // entry.reason 'merged-pr-head-contained'; `git ls-remote origin refs/heads/build/contained` empty
test('pruneRemote: remote branch that gained a commit after its PR head -> skip not-proven-merged, survives on origin (#4463)', ...);
  // headRefOid = the first pushed commit; branch tip has the second beyond it
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: FAIL after Step 1. The new delete tests report `not-proven-merged`.

- [ ] **Step 3: Implement**

`decideRemotePrune` gains `prHeadContained = false`. The `not-proven-merged` guard becomes `!cherryEquivalent && !squashMerged && !prHeadContained`. The final return picks the reason by the precedence above. In `pruneRemote`, after `squashMerged`, compute `const prHeadContained = cherryEquivalent || squashMerged ? false : isPrHeadContained(root, integration, `origin/${branch}`, prState);` and pass it in. Update the module header's evidence-bar sentence to name three proofs.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test tests/bin-lib/reconcile/prune-remote.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/prune-remote.js tests/bin-lib/reconcile/prune-remote.test.js
git commit -m "remote-prune: accept PR-head containment as merged proof — refs #4463"
```

### Task 5: Prose sweep and real-input probe

**Role:** integration

**Files:**
- Modify: `docs/reconcile-checks.md` (Merged-proof section: "Two proofs exist" becomes three; add item 3 **PR-head containment**; amend the "Both proofs judge the **local** integration ref" paragraph to say the third proof reads no integration ref and why; extend the Reason vocabulary paragraph with `pr-head-contained` / `merged-pr-head-contained`)
- Modify: `docs/plugin-structure.md:27` (prune-remote's "MERGED PR + cherry-equivalence" becomes the three proofs; the "seven further modules (…)" list becomes eight and gains `pr-head-containment.js`)
- Modify: `plugin/skills/tidy/SKILL.md:267` ("via cherry-equivalence, squash provenance (#2252), or an archive-tag-then-delete path" gains "PR-head containment (#4463)")
- Modify: `plugin/skills/tidy/step-6-auto.md:41` (the remote-prune Evidence parenthetical gains PR-head containment; the file sits at 48,934 bytes, near the Read-limit rail, so keep the addition under ~80 bytes)
- No change: `docs/journeys/tidy-standalone-auto-report.md` (Common Step 6 `/claude-tweaks:journeys` owns journey updates)

- [ ] **Step 1: Apply the prose edits above**

Edit in place, one clause each; keep each existing sentence's structure.

- [ ] **Step 2: Real-input probe**

Run the finished proof against the real merged branch named in Architecture:

Run: `node -e 'const {isPrHeadContained}=require("./plugin/bin/lib/reconcile/pr-head-containment");const {resolvePrState}=require("./plugin/bin/lib/reconcile/pr-state");const pr=resolvePrState(process.cwd(),"worktree-dispatch-record-4459");console.log(pr.number,pr.headRefOid,pr.baseRefName,isPrHeadContained(process.cwd(),"main","worktree-dispatch-record-4459",pr))'`
Expected: `4516 21b841cf66c4c64e7cf270014691a485fa0d0d44 main true`. Record the printed line in the PR description. If the branch is gone by execution time (another reconcile pass deleted it), pick any `worktree-dispatch-record-*` branch whose `gh pr list --head` shows MERGED and record that line instead.

- [ ] **Step 3: Run the reconcile suites**

Run: `node --test "tests/bin-lib/reconcile/*.test.js" tests/reconcile.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add docs/reconcile-checks.md docs/plugin-structure.md plugin/skills/tidy/SKILL.md plugin/skills/tidy/step-6-auto.md
git commit -m "Document the PR-head containment merged proof — refs #4463"
```
