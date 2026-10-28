# Reconcile Truncated PR Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A branch whose `associatedPullRequests(first:10)` page is truncated no longer fails the whole bulk PR screen. It is resolved on its own through the per-branch REST confirm, and every other branch keeps its screened state.

**Architecture:** `resolvePrStatesBulk` stops returning `'network-failure'` for a truncated page. Instead it stores a new exported sentinel, `PR_PAGE_TRUNCATED` (`'pr-page-truncated'`), as that branch's map value, which keeps it out of the transport-failure vocabulary. The two screen consumers, `archive-branches.js` and `prune-remote.js`, treat that sentinel as a blind screen value. They resolve the branch once through their per-branch resolver (`resolvePrState`, the REST `gh pr list --head` path), use that answer as its screen evidence, and reuse it as the confirm instead of calling a second time. Missing aliases, `errors[]` and transport throws still fail the whole call.

**Tech Stack:** Node 18+ CommonJS, `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-10-28T221447-record-4461/work/4461-spec.md`

**Scope keywords:** resolvePrStatesBulk, hasNextPage, pr-screen-failed, PR_PAGE_TRUNCATED

## Global Constraints

- Spec Deliverable 1, verbatim: "Resolve a truncated-page branch individually (per-branch confirm) instead of failing the chunk, keeping the module's "never a silent partial" posture for genuinely incomplete responses (missing alias, GraphQL errors)."
- Spec Approach, verbatim: "Distinguish the reason from a transport failure in the result vocabulary." The sentinel must never equal `'network-failure'` or `'gh-absent'`.
- Governing project skill `gh-api-module-pattern` (`.claude/skills/gh-api-module-pattern/batching-failure-posture.md`), quoted verbatim:
  - "Bulk evidence is also weaker than a per-branch read — `ref()` is null for a branch deleted after its PR merged — so a caller screens with it to skip cheaply and re-confirms via `resolvePrState` before anything destructive (`prune-remote.js`, `archive-branches.js`)."
  - "Discriminate on whether the screen value is *conclusive*, not on whether it is negative: an `OPEN` screen is a real answer and still short-circuits with no per-branch call at all, while `null` must cost one confirm."
  - "When adding or changing a screen/confirm caller, enumerate the screen's values against *every* provisional verdict the caller can reach, not just the destructive one; a permanent skip is a verdict too."
  - "-f, never -F: String! variables must not be type-coerced" (the bulk query's argv is unchanged by this plan; do not touch it).
- No preferOpen in archive-branches (screen or confirm); prune-remote passes `{ preferOpen: true }` to both its screen and its per-branch resolver. #664 says so explicitly, and the truncated-branch fallback keeps it.
- Commit message style: `{Verb} {what} — {detail}`, body line `refs #4461` (never "closes"/"fixes"), ending with the trailer `Claude-Session: https://claude.ai/code/session_01CcCLFsxPTfvN6CxgUbjKPy`.
- Scope and edit discipline: Commit tests only where the task asks for them or the repo already keeps tests for this kind of change, sized like the neighboring test files; scratch checks stay scratch. Touch only what the task requires — a pre-existing bug you notice is a follow-up to report, not a fix to fold in, unless the task cannot work without it. Don't reformat or "improve" adjacent code; edit in place rather than rewrite when the result is the same.

## Review Focus

1. A truncated branch whose per-branch fallback itself fails (`'network-failure'`/`'gh-absent'`) must skip with that reason, and only that branch. Every other branch is still classified. Pinned in Task 2 (prune-remote fallback-failure test).
2. A truncated branch that becomes a destructive candidate must not be confirmed twice. Its one per-branch answer is both the screen and the confirm. Pinned in Task 2 by confirm-call counts (archive and prune).
3. A truncated branch whose fallback answers OPEN under prune-remote's preferOpen must skip `pr-open` with no further per-branch work. Pinned in Task 2.
4. A truncation in chunk 1 of a multi-chunk screen must not stop later chunks from being issued and resolved. Pinned in Task 1.
5. Genuinely incomplete responses (a missing alias, a non-empty `errors[]`) must still fail the whole call with `'network-failure'`. The existing tests `response missing an alias key classifies network-failure` and `degraded responses classify network-failure` already pin this and must stay unchanged and green.

Known limit, not fixed here: the REST fallback (`resolvePrState`) runs `gh pr list` with its default `--limit 30`, so a branch with more than 30 PRs gets a recency window. That gap is pre-existing in `resolvePrState` (the governing skill names it), and it is reported as a follow-up, not folded in.

---

### Task 1: Bulk screen marks a truncated page with its own sentinel

**Role:** integration

**Files:**
- Modify: `plugin/bin/lib/reconcile/pr-state.js` (the `resolvePrStatesBulk` header comment at ~344-352, the truncation block at ~377-385, `module.exports`)
- Test: `tests/bin-lib/reconcile/pr-state.test.js` (replace the test at ~260-270 `a branch whose associatedPullRequests page is truncated (hasNextPage) fails the whole call closed` and its comment block)

**Interfaces:**
- Produces: `PR_PAGE_TRUNCATED` — exported string constant `'pr-page-truncated'` from `pr-state.js`. `resolvePrStatesBulk(repoRoot, branches, opts)` still returns either a `Map` or one of `'gh-absent'`/`'network-failure'`. The Map's values widen from `PR object | null` to `PR object | null | PR_PAGE_TRUNCATED`.

- [ ] **Step 1: Write the failing tests** (replace the old truncated-page test and its preceding comment; add `PR_PAGE_TRUNCATED` to the file's require destructure)

```js
test('AC1.1: a truncated associatedPullRequests page marks only that branch PR_PAGE_TRUNCATED; the rest of the chunk keeps its screened state', () => {
  const runner = () => graphqlResponse([{ prs: [PR_MERGED_10], hasNextPage: true }, { prs: [PR_MERGED_10] }, null]);
  const r = resolvePrStatesBulk(REPO_ROOT, ['worktree-sweep', 'few-prs', 'gone'], { runner, repoSlug: 'o/r' });
  assert.ok(r instanceof Map);
  assert.equal(r.get('worktree-sweep'), PR_PAGE_TRUNCATED);
  assert.equal(r.get('few-prs').number, 10);
  assert.equal(r.get('gone'), null);
  assert.equal(r.size, 3);
});

test('PR_PAGE_TRUNCATED is distinct from the transport-failure vocabulary', () => {
  assert.equal(PR_PAGE_TRUNCATED, 'pr-page-truncated');
  assert.notEqual(PR_PAGE_TRUNCATED, 'network-failure');
  assert.notEqual(PR_PAGE_TRUNCATED, 'gh-absent');
});

test('a truncated page in chunk 1 does not stop later chunks', () => {
  const branches = Array.from({ length: BULK_CHUNK + 1 }, (_, i) => 'br-' + i);
  let call = 0;
  const runner = () => {
    call += 1;
    return call === 1
      ? graphqlResponse([{ prs: [PR_MERGED_10], hasNextPage: true }, ...Array.from({ length: BULK_CHUNK - 1 }, () => null)])
      : graphqlResponse([{ prs: [PR_MERGED_10] }]);
  };
  const r = resolvePrStatesBulk(REPO_ROOT, branches, { runner, repoSlug: 'o/r' });
  assert.equal(call, 2);
  assert.equal(r.get('br-0'), PR_PAGE_TRUNCATED);
  assert.equal(r.get('br-' + BULK_CHUNK).number, 10);
  assert.equal(r.size, BULK_CHUNK + 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/reconcile/pr-state.test.js`
Expected: FAIL after Step 1 — `r instanceof Map` false (today the call returns `'network-failure'`), and `PR_PAGE_TRUNCATED` undefined.

- [ ] **Step 3: Implement in `plugin/bin/lib/reconcile/pr-state.js`**

Add `const PR_PAGE_TRUNCATED = 'pr-page-truncated';` next to `BULK_CHUNK`. In the per-alias loop, replace `if (assoc && assoc.pageInfo && assoc.pageInfo.hasNextPage) return 'network-failure';` with `map.set(chunk[i], PR_PAGE_TRUNCATED); continue;` (placed where the old return was). Rewrite the comment block above it to say: a truncated page is not an incomplete *response*. The response is whole, but one branch's page is not, so that branch alone is marked for its caller's per-branch confirm (#4461). That is the "retry envelope" posture, carried in the Map value. A missing alias and `errors[]` still fail the whole call. Update the function's header comment (`ALL-OR-NOTHING: ...`) to name the one exception, and the "A returned Map is complete..." sentence to name the third value. Export `PR_PAGE_TRUNCATED`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/pr-state.test.js`
Expected: PASS (all tests, including the unchanged missing-alias and degraded-response tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/reconcile/pr-state.js tests/bin-lib/reconcile/pr-state.test.js
git commit -m "Mark a truncated PR page per branch in resolvePrStatesBulk — no longer fails the whole screen

refs #4461

Claude-Session: https://claude.ai/code/session_01CcCLFsxPTfvN6CxgUbjKPy"
```

### Task 2: archive-branches and prune-remote resolve a truncated branch per-branch

**Role:** integration
**Review risk:** high

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-branches.js` (import; the per-candidate loop at ~181-243; the module header's screen-then-confirm paragraph at ~27-33)
- Modify: `plugin/bin/lib/reconcile/prune-remote.js` (import; the per-branch loop at ~128-150; the header at ~6-9)
- Modify: `.claude/skills/gh-api-module-pattern/batching-failure-posture.md` (the bullet "A bulk alias query is chunked, all-or-nothing, ...": add one sentence naming the truncated-page exception and its routing)
- Modify: `docs/plugin-structure.md:27` (the phrase "in ceil(N/50) all-or-nothing round trips, #1082": add "— a branch whose PR page is truncated is marked `pr-page-truncated` for its caller's per-branch confirm rather than failing the screen, #4461")
- Test: `tests/bin-lib/reconcile/archive-branches.test.js`, `tests/bin-lib/reconcile/prune-remote.test.js`

**Interfaces:**
- Consumes: `PR_PAGE_TRUNCATED` and `resolvePrStatesBulk` from `plugin/bin/lib/reconcile/pr-state.js` (Task 1).
- Produces: no new exports. Entry reasons are unchanged: a truncated branch is classified by its per-branch answer through the existing `decideArchive`/`decideRemotePrune` tables.

Consumer handling (both files): read `const screened = screen.get(branch);`. When `screened === PR_PAGE_TRUNCATED`, the branch's screen evidence is `resolve(root, branch)` in archive-branches, or `resolve(root, branch, { preferOpen: true })` in prune-remote, called exactly once. Later in the same iteration, the confirm reuses that value instead of calling `resolve` again. Every other value keeps today's `screened || null`. Every provisional path then runs unchanged on the resolved value (this is the enumeration the governing skill requires): an OPEN answer skips `pr-open`, a transport string skips with that reason, and a null/CLOSED/MERGED answer takes today's cherry/age/squash routes.

- [ ] **Step 1: Write the failing tests**

Fake runner shared by both suites (define once per test file):

```js
// A GraphQL runner for the REAL resolvePrStatesBulk: alias b{i} -> the page for branches[i].
// `pages` maps branch -> { prs, hasNextPage } or null (no ref).
function bulkVia(pages) {
  return (root, branches, opts) => resolvePrStatesBulk(root, branches, {
    ...opts,
    repoSlug: 'o/r',
    runner: () => {
      const repository = {};
      branches.forEach((b, i) => {
        const p = pages[b];
        repository['b' + i] = p == null ? null : { associatedPullRequests: { nodes: p.prs, pageInfo: { hasNextPage: !!p.hasNextPage } } };
      });
      return JSON.stringify({ data: { repository } });
    },
  });
}
```

`archive-branches.test.js`:

Fixture helper `makeTruncatedFixture({ sweepCherryPicked })`: `makeRepo()`, then two branches made like the existing cherry-equivalent test's `build/eq`: `build/eq` (always cherry-picked onto main) and `worktree-sweep` (cherry-picked onto main only when `sweepCherryPicked`). Return `dir`.

```js
test('AC1.1: one branch with more than 10 associated PRs (truncated page) — every other branch is still classified in the same pass', () => {
  const dir = makeTruncatedFixture({ sweepCherryPicked: false });
  const confirms = {};
  const resolvePr = (root, branch) => { confirms[branch] = (confirms[branch] || 0) + 1; return null; };
  const resolvePrBulk = bulkVia({ 'build/eq': null, 'worktree-sweep': { prs: [], hasNextPage: true } });
  const r = archiveBranches({ cwd: dir, integration: 'main', dryRun: true, resolvePr, resolvePrBulk });
  assert.strictEqual(r.failure, null);
  assert.deepEqual(r.entries.find((e) => e.name === 'build/eq'), { name: 'build/eq', kind: 'branch', action: 'delete', reason: 'cherry-equivalent' });
  assert.deepEqual(r.entries.find((e) => e.name === 'worktree-sweep'), { name: 'worktree-sweep', kind: 'branch', action: 'skip', reason: 'too-young' });
  assert.strictEqual(confirms['worktree-sweep'], 1);
});
```

Two more tests in that style, on the same fixture:
- `truncated-page branch whose per-branch answer is OPEN skips pr-open with one per-branch call`: `sweepCherryPicked: false`, and resolvePr answers `{ number: 2, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' }` for `worktree-sweep`. Assert `worktree-sweep` → `{ action: 'skip', reason: 'pr-open' }`, `confirms['worktree-sweep'] === 1`, and `build/eq` still `delete`.
- `truncated-page destructive candidate is confirmed once — the per-branch answer is reused`: `sweepCherryPicked: true`, and resolvePr answers `{ number: 1, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }` for `worktree-sweep`. Assert `worktree-sweep` → `{ action: 'delete', reason: 'cherry-equivalent' }` and `confirms['worktree-sweep'] === 1`.

Why these discriminate: with Task 1 landed but archive-branches unchanged, the sentinel string reaches `decideArchive` as `prState`. A non-cherry-equivalent `worktree-sweep` then reads `skip`/`merged-pr-without-cherry-equivalence` with zero confirms, so the first two tests go red. The third goes red only under Step 5's no-reuse mutation (two confirms). Import `resolvePrStatesBulk` from `../../../plugin/bin/lib/reconcile/pr-state`.

`prune-remote.test.js` (beside the existing screen tests, reusing `makeRepoWithOrigin`, `MERGED_PR`, `OPEN_PR`). Add a fixture function `buildTruncatedScreenFixture()` that creates, pushes, cherry-picks onto main and deletes locally two branches, `build/screened` and `worktree-sweep`, in the exact shape of `buildScreenFixture()`:

```js
test('AC1.1: one remote branch with more than 10 associated PRs no longer fails the screen — the other branch is still pruned', () => {
  const dir = buildTruncatedScreenFixture();
  const calls = {};
  const resolvePr = (root, branch, opts) => { assert.equal(opts && opts.preferOpen, true); calls[branch] = (calls[branch] || 0) + 1; return MERGED_PR; };
  const resolvePrBulk = bulkVia({ 'build/screened': { prs: [MERGED_PR] }, 'worktree-sweep': { prs: [], hasNextPage: true } });
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr, resolvePrBulk, skipFetch: true });
  assert.equal(r.failure, null); // not 'pr-screen-failed'
  assert.equal(r.entries.find((e) => e.name === 'build/screened').action, 'delete');
  assert.equal(r.entries.find((e) => e.name === 'worktree-sweep').action, 'delete');
  assert.equal(calls['worktree-sweep'], 1); // one per-branch read serves screen and confirm
  assert.equal(git(dir, 'ls-remote', '--heads', 'origin', 'build/screened').trim(), '');
});

test('truncated-page branch whose per-branch fallback fails skips with that reason; the other branch is still pruned', () => {
  // resolvePr returns 'network-failure' for worktree-sweep, MERGED_PR otherwise
  // assert failure null, worktree-sweep -> { action: 'skip', reason: 'network-failure' }, build/screened -> 'delete'
});

test('truncated-page branch whose per-branch answer is OPEN skips pr-open with one per-branch call', () => {
  // resolvePr returns OPEN_PR for worktree-sweep
  // assert worktree-sweep -> { action: 'skip', reason: 'pr-open' }, calls['worktree-sweep'] === 1, build/screened -> 'delete'
});
```

Write the commented test bodies in the same style as the first test of the same file. Import `resolvePrStatesBulk` from `../../../plugin/bin/lib/reconcile/pr-state`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js tests/bin-lib/reconcile/prune-remote.test.js`
Expected: FAIL after Step 1. With Task 1 landed, the consumers do not yet know the sentinel. Archive reads `worktree-sweep` as `merged-pr-without-cherry-equivalence` with zero confirms. Prune-remote reads it as `no-merged-pr` with zero per-branch calls, so the AC1.1 delete, the `network-failure` reason and the `pr-open` reason all go red.

- [ ] **Step 3: Implement the consumer handling above in both modules**, and add one sentence per module header naming the truncated-page route (#4461). Make the two doc edits listed under Files.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/reconcile/archive-branches.test.js tests/bin-lib/reconcile/prune-remote.test.js tests/bin-lib/reconcile/pr-state.test.js`
Expected: PASS

- [ ] **Step 5: Discrimination check (scratch, not committed)**

Temporarily replace the reuse with a second `resolve(...)` call, first in prune-remote and then in archive-branches. In each, the AC1.1/destructive-candidate `=== 1` call-count assertion must go red. Then temporarily drop the `PR_PAGE_TRUNCATED` branch in archive-branches; the AC1.1 archive test must go red. Restore everything, then re-run Step 4.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/reconcile/archive-branches.js plugin/bin/lib/reconcile/prune-remote.js tests/bin-lib/reconcile/archive-branches.test.js tests/bin-lib/reconcile/prune-remote.test.js .claude/skills/gh-api-module-pattern/batching-failure-posture.md docs/plugin-structure.md
git commit -m "Resolve a truncated-page branch per-branch in archive-branches and remote-prune — one reused branch name no longer disables both checks

refs #4461

Claude-Session: https://claude.ai/code/session_01CcCLFsxPTfvN6CxgUbjKPy"
```
