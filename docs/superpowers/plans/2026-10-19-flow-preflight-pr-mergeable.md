# flow-preflight pr probe mergeable state Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The flow-preflight pack's `pr` probe reports `mergeable`/`mergeStateStatus`, and the adopted-run path surfaces a `CONFLICTING` PR and catches up before any later phase runs.

**Architecture:** One more pair of JSON fields on the probe's existing `gh pr view` call (no new round-trip). The probe also computes a `conflictNote` string from an exported literal (`PR_CONFLICT_NOTE`) — non-null only for `mergeable === 'CONFLICTING'` — so the skill prose prints it verbatim, the same way `adoption.value.note` / `ADOPTION_NOTES` already work. The routing is prose in `steps-and-gates.md`'s adoption section, citing `_shared/git-discipline.md`'s existing Catch-up procedure rather than restating it.

**Tech Stack:** Node (CommonJS), `node --test`, markdown skill prose.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T174556-record-3014/work/3014-spec.md` (record #3014)

**Scope keywords:** mergeable, mergeStateStatus, conflictNote, PR_CONFLICT_NOTE

## Global Constraints

- Add fields to the pack's `pr` value; never rename or drop `number`/`url`/`branch`/`state`/`isDraft`/`checklist`.
- A forge/`gh` that omits `mergeable` or `mergeStateStatus` yields `null` for that field, never an error that fails the `pr` probe (`ok: true`).
- `UNKNOWN` (GitHub's transient value) and `MERGEABLE` are a no-op: no line, no decision entry, no behavior change. Never poll in the probe (`PROBE_TIMEOUT_MS`).
- The visible line is exactly: `Run PR #{n} is CONFLICTING with {integration branch} — CI will not run on it until the conflict is resolved.`
- Keep the `CONFLICTING` handling on the adoption path; do not fold it into #3013's PR-check read in `/test` / `/review` Step 1.5.
- Commit messages: `{Verb} {what} — {detail}`, reference the record as `refs #3014` (never `closes`/`fixes`).

## Review Focus

- `gh` returns `mergeable` as a non-string (`null`, missing, number) → field is `null`, `conflictNote` is `null`, `pr.ok` stays `true` (Task 1 test).
- `mergeable: UNKNOWN` (common right after a push) → `conflictNote` `null` (Task 1 test).
- `integration-branch` policy unresolved → note names `main`, the same fallback `changedFiles` uses (Task 1 test).
- `gh` absent (`pr.ok === false`) or no recorded PR (`pr.value === null`) → the prose's check reads `pr.value.mergeable` only when `pr.ok` and `pr.value` are set (Task 2 conformance assertion that the prose guards on `pr.ok`).
- `mergeStateStatus: DIRTY` with a non-`CONFLICTING` `mergeable` → no note (spec keys on `mergeable` only; the post-push merge-state check in `git-discipline.md` still covers DIRTY at phase exits) — Task 1 test pins this so a later widening is deliberate.

---

### Task 1: `pr` probe reports mergeability and a conflict note

**Files:**
- Modify: `plugin/bin/lib/flow/preflight.js` (the `pr` probe in `buildProbes`, ~`:281-290`; `changedFiles` probe's integration-branch read, ~`:292-296`; `module.exports`)
- Test: `tests/bin-lib/flow/preflight.test.js`

**Interfaces:**
- Produces: exported `PR_CONFLICT_NOTE` (string) = `'Run PR #{n} is CONFLICTING with {integration branch} — CI will not run on it until the conflict is resolved.'`
- Produces: `pack.pr.value` = `{ number, url, branch, state, isDraft, checklist, mergeable: string|null, mergeStateStatus: string|null, conflictNote: string|null }`; `conflictNote` is `PR_CONFLICT_NOTE` with `{n}` → the PR number and `{integration branch}` → the resolved integration branch, only when `mergeable === 'CONFLICTING'`.

- [ ] **Step 1: Write the failing tests (AC1.1, AC1.2, AC3.1, AC3.2)** in `tests/bin-lib/flow/preflight.test.js` (import `PR_CONFLICT_NOTE` from the module). Use `seedCase1(fx)` and the existing `deps(fx, { execFile })` override shape; the existing `resolvePolicy` stub resolves `integration-branch` to `main`.

```js
test('pr probe: a CONFLICTING PR carries mergeable, mergeStateStatus and the conflict note (#3014)', async () => {
  // gh stub returns { state: 'OPEN', isDraft: false, body: PR_BODY, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }
  // and records args; assert the gh args include '--json' followed by 'state,isDraft,body,mergeable,mergeStateStatus'
  assert.strictEqual(pack.pr.ok, true);
  assert.strictEqual(pack.pr.value.mergeable, 'CONFLICTING');
  assert.strictEqual(pack.pr.value.mergeStateStatus, 'DIRTY');
  assert.strictEqual(pack.pr.value.conflictNote, 'Run PR #1901 is CONFLICTING with main — CI will not run on it until the conflict is resolved.');
  assert.strictEqual(pack.pr.value.conflictNote, PR_CONFLICT_NOTE.replace('{n}', '1901').replace('{integration branch}', 'main'));
  // existing keys untouched
  assert.strictEqual(pack.pr.value.state, 'OPEN');
  assert.strictEqual(pack.pr.value.isDraft, false);
  assert.strictEqual(pack.pr.value.checklist.length, 5);
});

test('pr probe: a gh response omitting both fields yields nulls and ok: true (#3014)', async () => {
  // gh stub returns { state: 'OPEN', isDraft: true, body: PR_BODY } (no mergeable/mergeStateStatus)
  assert.strictEqual(pack.pr.ok, true);
  assert.strictEqual(pack.pr.value.mergeable, null);
  assert.strictEqual(pack.pr.value.mergeStateStatus, null);
  assert.strictEqual(pack.pr.value.conflictNote, null);
});

test('pr probe: MERGEABLE, UNKNOWN, a non-string mergeable, and DIRTY-with-MERGEABLE all produce no conflict note (#3014)', async () => {
  // loop over [{mergeable:'MERGEABLE',mergeStateStatus:'CLEAN'}, {mergeable:'UNKNOWN',mergeStateStatus:'UNKNOWN'},
  //            {mergeable:7,mergeStateStatus:null}, {mergeable:'MERGEABLE',mergeStateStatus:'DIRTY'}]
  assert.strictEqual(pack.pr.value.conflictNote, null);
  // and for the non-string case: assert.strictEqual(pack.pr.value.mergeable, null)
});

test('pr probe: the conflict note names the resolved integration branch, falling back to main (#3014)', async () => {
  // resolvePolicy stub resolving integration-branch to { value: 'develop', source: 'policy' } → note contains 'with develop —'
  // resolvePolicy stub resolving integration-branch to { error: 'unknown-key' } → note contains 'with main —'
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/flow/preflight.test.js`
Expected: FAIL — `PR_CONFLICT_NOTE` is undefined / `pack.pr.value.mergeable` is `undefined`.

- [ ] **Step 3: Implement** in `plugin/bin/lib/flow/preflight.js`:
  - `const PR_CONFLICT_NOTE = 'Run PR #{n} is CONFLICTING with {integration branch} — CI will not run on it until the conflict is resolved.';` near `ADOPTION_NOTES`; add it to `module.exports`.
  - Inside `buildProbes`, a local `integrationBranch()` returning `policy()['integration-branch'].value` as a string, else `'main'` — and use it in `changedFiles` too, replacing that probe's inline two-liner (same behavior).
  - `pr` probe: `--json` value `'state,isDraft,body,mergeable,mergeStateStatus'`; return the existing keys plus `mergeable` / `mergeStateStatus` (the view's value when it is a string, else `null`) and `conflictNote` (`PR_CONFLICT_NOTE` filled in when `mergeable === 'CONFLICTING'`, else `null`).

- [ ] **Step 4: Run the tests to verify they pass (AC4.1)**

Run: `node --test tests/bin-lib/flow/preflight.test.js tests/bin-lib/flow/preflight-cli.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/flow/preflight.js tests/bin-lib/flow/preflight.test.js
git commit -m "Report PR mergeability in the flow-preflight pack — pr probe adds mergeable, mergeStateStatus and conflictNote, refs #3014"
```

### Task 2: Adopted-run path surfaces a CONFLICTING PR and routes to catch-up

Waived AC5.1: the full `npm test` runs once, centrally, at the build's Common Step 5 Final Verification — not per task.

**Files:**
- Modify: `plugin/skills/flow/steps-and-gates.md` (`### Adopting an inherited run directory`, a new paragraph directly after the "Gather the facts once (#1931)" paragraph, before case 1)
- Test: `tests/flow-preflight-conformance.test.js`

**Interfaces:**
- Consumes: `PR_CONFLICT_NOTE` and `pack.pr.value.{mergeable, conflictNote}` from Task 1.

- [ ] **Step 1: Write the failing test (AC2.1, AC3.1)** in `tests/flow-preflight-conformance.test.js` (import `PR_CONFLICT_NOTE` alongside `ADOPTION_NOTES`):

```js
test('the adoption section surfaces a CONFLICTING run PR and routes it to the git-discipline catch-up (#3014)', () => {
  const t = read('plugin/skills/flow/steps-and-gates.md');
  const section = t.slice(t.indexOf('### Adopting an inherited run directory'), t.indexOf('### Partial step lists'));
  assert.ok(section.includes('`' + PR_CONFLICT_NOTE + '`'), 'the conflict line literal is rendered verbatim');
  assert.match(section, /pr\.value\.mergeable === 'CONFLICTING'/);
  assert.match(section, /pr\.value\.conflictNote/);
  assert.match(section, /pr\.ok/, 'the check guards on a successful pr read');
  assert.match(section, /_shared\/git-discipline\.md`'s Post-push merge-state check/);
  assert.match(section, /Catch-up \(`auto`\)/);
  assert.match(section, /--diff-filter=U/, 'the conflicting paths are named');
  assert.match(section, /HARD-GATE/);
  assert.match(section, /`MERGEABLE`/);
  assert.match(section, /`UNKNOWN`/);
  // ordering: after the BLOCKED freshness stop, before case 1
  const conflict = section.indexOf("pr.value.mergeable === 'CONFLICTING'");
  assert.ok(section.indexOf("freshness.value.verdict === 'BLOCKED'") < conflict);
  assert.ok(conflict < section.indexOf('1. **Set, the directory it names exists'));
});
```

- [ ] **Step 2: Run the test to verify it fails (AC2.2)**

Run: `node --test tests/flow-preflight-conformance.test.js`
Expected: FAIL — the conflict literal is not in the section.

- [ ] **Step 3: Write the paragraph** in `steps-and-gates.md`. Bold lead `**A run PR that turned CONFLICTING between calls (#3014).**` It must say, in this order:
  - Only when `pr.ok` and `pr.value.mergeable === 'CONFLICTING'` (a non-null `pr.value.conflictNote`): print `pr.value.conflictNote` verbatim — render the `PR_CONFLICT_NOTE` literal in backticks — before any later phase runs, and log it as one `AUTO` decision (`log-decision.js`, `--section "/flow"`, `--step "Adoption: PR merge state"`, `--reversibility n/a`, the note as `--text`).
  - Why: GitHub runs no `pull_request` CI on a conflicting PR, so the prior call's stamp and checks describe a tree that no longer merges.
  - Then catch up per `_shared/git-discipline.md`'s Post-push merge-state check, its **Catch-up (`auto`)** steps 1-5 (cite; do not restate), with one difference on this path: a merge conflict is never resolved here — list the conflicting paths (`git -C "{worktree-path}" diff --name-only --diff-filter=U`), `merge --abort` (own Bash call), and stop as a HARD-GATE failure naming those paths, before review trusts the stamp.
  - After a catch-up that advanced HEAD, re-verify: the pack's `stamp` was read before the merge and no longer describes HEAD, so run `/claude-tweaks:test` before the first later phase that gates on it.
  - `interactive`/`hybrid`: surface the line and the commands, as that section's own mode routing does.
  - `MERGEABLE`, `UNKNOWN` (GitHub still computing — never re-read or polled), a `null` field, `pr.ok === false`, or `pr.value === null`: nothing — no line, no decision entry.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/flow-preflight-conformance.test.js tests/flow-resume-freshness-citations.test.js tests/dispatch-flow-rundir-handoff.test.js tests/pr-early-run-lifecycle.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/flow/steps-and-gates.md tests/flow-preflight-conformance.test.js
git commit -m "Surface a CONFLICTING run PR on flow's adopted-run path — print the pack's conflict note and route to the git-discipline catch-up, refs #3014"
```
