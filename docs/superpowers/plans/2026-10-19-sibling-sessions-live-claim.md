# Sibling-Sessions Live-Claim Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `hooks.js check-sibling-sessions --record N` also report a live claims-registry claim held by another session, not only a locally locked worktree.

**Architecture:** Add `findLiveClaim(recordRef, opts)` to `plugin/bin/lib/hooks/sibling-sessions.js`, reading the claim blob through the claim system's own reader and `classifyClaimBlob`, and call it from the `check-sibling-sessions` handler only when `findConflictingSession` found nothing. Advisory and fail-open throughout; flow Step 2.8's atomic claim stays the correctness boundary.

**Tech Stack:** Node 18+ CommonJS, `node --test`, git + `gh` (claims read only).

**Spec:** `.claude-tweaks/pipelines/2026-10-19T110428-record-3030/work/3030-spec.md`

## Global Constraints

- `findLiveClaim` stays synchronous (spec Gotcha 1: `readClaimBlob` is synchronous).
- The default reader `require`s claim-store / claims-git-cas / git-exec lazily, inside the closure (spec Gotcha 2).
- Own-session exclusion only when `CLAUDE_CODE_SESSION_ID` (or injected `sessionId`) is set; with none, every live claim reads foreign — state this in the module comment (spec Gotcha 3).
- Output line prefix must be exactly `claude-tweaks: sibling session may already hold record {ref} — ` so `sibling-session-check.md`'s branching is unchanged.
- No usage-table text changes in `hooks.js` (`tests/hooks-help-guard.test.js` pins it).
- **Premise refinement (logged in decisions.md):** the default reader is built on `claim-store.js`'s `createClaimReader({ gitRunner, repoSlug })` (#3393), which wraps `readClaimBlob` and turns an unresolved repo slug into a failure instead of a `repos/null/contents/...` request. Spec Deliverable 1's "reads through the existing `readClaimBlob`" is satisfied through that wrapper.

## Review Focus

- A record ref with leading/trailing whitespace or a slug (`flow-spec-12`) must never trigger a network read — covered by the slug no-read assertion in Task 1.
- A claim blob that parses to a non-object (`"[]"`, `"42"`) must read as `null`, not throw — `classifyClaimBlob` returns `unreadable`; add `'[]'` to Task 1's null cases.
- `origin` absent / offline: the default reader returns `{failure}` → `null`, and the handler prints the no-conflict line — verified by Task 2's live probe only indirectly; acceptable for an advisory check.
- A live claim with missing identity fields must still print `(unknown)` placeholders, not `undefined` — Task 1 asserts nulls for a blob missing `host`.
- The worktree-lock branch must still return before any claim read (cheap local check first) — Task 2 keeps the early `return 0`.

---

### Task 1: `findLiveClaim` in sibling-sessions.js

**Files:**
- Modify: `plugin/bin/lib/hooks/sibling-sessions.js` (header comment; append `defaultReadClaim` + `findLiveClaim`; export)
- Test: `tests/hooks-sibling-sessions.test.js` (import line; two new tests at end of file)

**Interfaces:**
- Consumes: `createClaimReader` from `plugin/bin/lib/issues/claim-store.js` (`({gitRunner, repoSlug}) -> {read(n) -> {content}|{failure}}`); `defaultRunner(args, opts)` from `plugin/bin/lib/issues/claims-git-cas.js`; `repoSlugOf(cwd)` from `plugin/bin/lib/hooks/git-exec.js`; `classifyClaimBlob(content, now) -> {state}` from `plugin/bin/lib/issues/claims.js`.
- Produces: `findLiveClaim(recordRef: string, opts?: {cwd?, readClaim?: (n:number)=>string|null, sessionId?: string|null, now?: number}) -> {runId, sessionId, host, claimedAt} | null`, exported alongside the existing three.

- [ ] **Step 1: Write the failing tests** — append to `tests/hooks-sibling-sessions.test.js`, and change the import to destructure `findLiveClaim` too:

```js
const NOW = Date.parse('2026-10-05T12:00:00Z');
const claimBlob = (over = {}) => JSON.stringify({
  runId: '2026-10-05T114600-record-77', sessionId: 'sibling', claimedAt: '2026-10-05T11:46:00Z', ttlHours: 72, host: 'other-box', ...over,
});

test('AC1.1: findLiveClaim reports a live claim held by another session, for 77 and #77', () => {
  const expected = { runId: '2026-10-05T114600-record-77', sessionId: 'sibling', host: 'other-box', claimedAt: '2026-10-05T11:46:00Z' };
  assert.deepStrictEqual(findLiveClaim('77', { readClaim: () => claimBlob(), sessionId: 'me', now: NOW }), expected);
  assert.deepStrictEqual(findLiveClaim('#77', { readClaim: () => claimBlob(), sessionId: 'me', now: NOW }), expected);
  // missing identity field -> null, never undefined
  assert.strictEqual(findLiveClaim('77', { readClaim: () => claimBlob({ host: undefined }), sessionId: 'me', now: NOW }).host, null);
});

test('AC2.1: findLiveClaim fails open to null — own session, tombstone, stale, absent, unparseable, non-object, throwing reader, slug ref (no read)', () => {
  const opts = (readClaim, sessionId = 'me') => ({ readClaim, sessionId, now: NOW });
  assert.strictEqual(findLiveClaim('77', opts(() => claimBlob(), 'sibling')), null);
  assert.strictEqual(findLiveClaim('77', opts(() => JSON.stringify({ released: true, runId: 'x' }))), null);
  assert.strictEqual(findLiveClaim('77', opts(() => claimBlob({ claimedAt: '2026-09-01T00:00:00Z' }))), null);
  assert.strictEqual(findLiveClaim('77', opts(() => null)), null);
  assert.strictEqual(findLiveClaim('77', opts(() => '{not json')), null);
  assert.strictEqual(findLiveClaim('77', opts(() => '[]')), null);
  assert.strictEqual(findLiveClaim('77', opts(() => { throw new Error('offline'); })), null);
  let called = false;
  assert.strictEqual(findLiveClaim('flow-spec-12', opts(() => { called = true; return claimBlob(); })), null);
  assert.strictEqual(called, false, 'a slug ref never triggers a claim read');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks-sibling-sessions.test.js`
Expected: FAIL with "findLiveClaim is not a function"

- [ ] **Step 3: Implement `findLiveClaim` and its default reader in `plugin/bin/lib/hooks/sibling-sessions.js`**

- Ref gate first: `/^#?[1-9]\d*$/` on `String(recordRef)`; anything else returns `null` before any read.
- `defaultReadClaim(cwd)` returns `(n) => { const r = createClaimReader({ gitRunner: (args, o) => defaultRunner(args, { cwd, ...o }), repoSlug: repoSlugOf(cwd) }).read(n); return r.failure ? null : r.content; }` with all three `require`s inside the closure.
- `sessionId` via the same `hasOwnProperty(opts, 'sessionId') ? opts.sessionId : process.env.CLAUDE_CODE_SESSION_ID` idiom `findConflictingSession` uses; `now = opts.now || Date.now()`.
- Reader call wrapped in try/catch → `null`; `classifyClaimBlob(content, now).state !== 'live'` → `null`; own claim (`sessionId && claim.sessionId === sessionId`) → `null`; return the four fields with `|| null`.
- Update the module header comment: the module now also consults the claims registry (remote-facing half), and the no-session-id caveat.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/hooks-sibling-sessions.test.js`
Expected: PASS, 18 tests, 0 fail

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/hooks/sibling-sessions.js tests/hooks-sibling-sessions.test.js
git commit -m "Add findLiveClaim to sibling-sessions — reads the claims registry for a live foreign claim (refs #3030)"
```

### Task 2: Wire the handler and correct the dispatch doc

**Files:**
- Modify: `plugin/bin/hooks.js` (`check-sibling-sessions` handler, ~line 1363-1389)
- Modify: `plugin/skills/dispatch/sibling-session-check.md` (first branch bullet; the "additive to the existing branches/claims/labels check" paragraph)

**Interfaces:**
- Consumes: `siblingSessions.findLiveClaim(recordRef, { cwd: process.cwd() })` from Task 1.
- Produces: stdout line `claude-tweaks: sibling session may already hold record {ref} — live claim by run {runId} (session {sessionId}, host {host}, claimed {claimedAt}); verify before claiming`, each missing field rendered `(unknown)`.

- [ ] **Step 1: Confirm the live probe input** — this run holds a live claim on #3030 (`claim-targets.js` at Step 2.8) and no locked worktree names 3030.

- [ ] **Step 2: Run the live probe to verify it fails today**

Run: `CLAUDE_CODE_SESSION_ID=probe-other node plugin/bin/hooks.js check-sibling-sessions --record 3030 | grep -q "live claim by run 2026-10-19T110428-record-3030"`
Expected: FAIL (exit 1 — prints `no sibling-session conflict found for record 3030`)

- [ ] **Step 3: Wire the handler** — in the worktree-match branch add `return 0;` after its write (unchanged text); after it, call `findLiveClaim` and on a hit write the Produces line; otherwise keep the existing no-conflict line. Add a two-line comment: the worktree lock sees only local siblings; the live claim is the remote-facing half.

- [ ] **Step 4: Update `sibling-session-check.md`** — first bullet names both sources: a live worktree (path, branch, pid) whose lock names the record, or a live claims-registry claim held by another session (run, session, host, claimed-at), covering a sibling on another machine, in the cloud, with an unlabeled worktree, or claimed-but-no-worktree-yet. Replace the "This check is additive to the existing branches/claims/labels check that follows in Step 4…" paragraph with: the check is advisory; `/claude-tweaks:flow` Step 2.8's atomic claim (`flow/claim-targets.md`, inside the group's first Task call) stays the correctness boundary; this check only stops dispatch from minting a run dir and worktree for a group a sibling already holds. Keep the rest of the file byte-identical.

- [ ] **Step 5: Verify (AC3.1, AC3.2, AC4.1, AC5.1)**

Run: `CLAUDE_CODE_SESSION_ID=probe-other node plugin/bin/hooks.js check-sibling-sessions --record 3030`
Expected: `claude-tweaks: sibling session may already hold record 3030 — live claim by run 2026-10-19T110428-record-3030 (session 08dace7f-…, host …, claimed …); verify before claiming` (AC3.1)

Run: `node plugin/bin/hooks.js check-sibling-sessions --record 3030`
Expected: `no sibling-session conflict found for record 3030` (own session's claim excluded — AC2.1's own-session case, live)

Run: `node plugin/bin/hooks.js check-sibling-sessions --record 3572`
Expected: the unchanged worktree-lock line naming `flow-spec-3572` (AC3.2 — live only while that sibling session holds its lock; if its lock is gone, record the probe as not runnable rather than passing it)

Run: `grep -c "follows in Step 4" plugin/skills/dispatch/sibling-session-check.md; grep -c "Step 2.8" plugin/skills/dispatch/sibling-session-check.md`
Expected: `0` then a count ≥ 1 (AC4.1)

Run: `node --test tests/hooks-sibling-sessions.test.js tests/hooks-help-guard.test.js tests/dispatch-config-gate-conformance.test.js tests/dispatch-sequential-execution-conformance.test.js`
Expected: PASS, 0 fail (AC5.1, plus the two suites that read `sibling-session-check.md`)

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/hooks.js plugin/skills/dispatch/sibling-session-check.md
git commit -m "Wire findLiveClaim into check-sibling-sessions and correct the stale Step 4 claims sentence (refs #3030)"
```

## Spec coverage map

| AC clause | Covered by |
|---|---|
| AC1.1 | Task 1 test `AC1.1` |
| AC2.1 | Task 1 test `AC2.1` |
| AC3.1 | Task 2 Step 5 live probe (probe-other session) |
| AC3.2 | Task 2 Step 5 live probe (record 3572) |
| AC4.1 | Task 2 Step 5 grep |
| AC5.1 | Task 2 Step 5 targeted suites |

Waived AC3.1: no committed CLI-level test — the handler has no injection seam, and the spec's Deliverable 4 scopes tests to the module; covered by the live real-input probe instead.
Waived AC3.2: same reason; the worktree branch's text is untouched and returns before the claim read.
