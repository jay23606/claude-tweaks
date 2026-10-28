# Below-Floor Parent Close Implementation Plan (#4466)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the wrap-up Parent-Gate Procedure finds a decomposition parent `due` and below the oversight floor (`exceeds: false`), close the parent with a comment listing its sub-issues. Today that branch says the parent "closes cleanly", but nothing closes it.

**Architecture:** The procedure (`plugin/skills/wrap-up/verification-brief-parent-gate.md`) gets one canonical "Close the parent below the floor" section. Both entry shapes run it from the `exceeds: false` branch. It writes a comment headed `## Closed below the oversight floor` (a body section under `local-files`) and then closes the parent. `engine-verify.js`'s `acceptance-labeling` check stops skipping a below-floor due parent: it now checks that the parent is closed and carries that comment. `/tidy`'s two parent-gate backstop scans stop filtering out below-floor due parents. They emit them as a `[parent-gate]` row that the same `Open parent gate` action resolves by closing the parent.

**Tech Stack:** Markdown skill prose, Node 18+ CommonJS (`plugin/bin/lib/wrap-up/engine-verify.js`), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-10-28T225741-record-4466/work/4466-spec.md` (record #4466)

Scope keywords: closes cleanly, ever closes a parent, never closes the parent

## Global Constraints

- Shared marker heading, byte-identical in every task: `## Closed below the oversight floor`.
- `github-issues` close sequence: post the comment first (`gh issue comment $PARENT_NUM --body-file …`), then `gh issue close $PARENT_NUM --reason completed`. A reader never sees the parent closed without the listing comment.
- `local-files` close sequence: append the section to the parent body with `writeRecord`, then call `closeRecord(parentPath)` (`plugin/bin/lib/issues/local-store.js`). `closeRecord` re-reads the file, so it keeps the appended body.
- Session-scoped temp file for the comment body: `parent-close-comment.md`, resolved by `node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" --value parent-close-comment.md` (`_shared/session-tmp-root.md`). Never `/tmp`.
- The below-floor branch never writes `demo:pending`, `demo:approved` or `demo:changes-requested`, and never composes a Verification Brief.
- `plugin/skills/tidy/step-6-auto.md` is 48,934 bytes against `RAIL_BYTES` 52,500. Task 3 may add at most 400 bytes there (`wc -c` after the edit must stay under 49,400).
- Commits: `{Verb} {what} — {detail}` subject plus `refs #4466`, never `closes`/`fixes`. End each message with the line `Claude-Session: https://claude.ai/code/session_01CcCLFsxPTfvN6CxgUbjKPy`. Run git with `git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-4466"`, one plain command per call. Never `git stash`.
- Scope and edit discipline: commit tests only where the task asks for them or the repo already keeps tests for this kind of change, sized like the neighboring test files; scratch checks stay scratch. Touch only what the task requires. A pre-existing bug you notice is a follow-up to report, not a fix to fold in, unless the task cannot work without it. Don't reformat or "improve" adjacent code; edit in place rather than rewrite when the result is the same.
- Run targeted suites only (`node --test <file>`). The full suite runs centrally.

## Review Focus

1. **Re-entry for the same parent** (dispatch's group gate runs the procedure once per group member, and a `/tidy` approval can follow a partial wrap-up). Expected: a parent that is already `CLOSED` is a no-op. A parent that already carries a trusted `## Closed below the oversight floor` comment but is still open gets only the close, with no second comment. Pinned in Task 1 (prose) and Task 2 (verify passes on exactly one comment).
2. **Comment posted, close failed** (transient `gh` error between the two calls). Expected: report exactly which step failed and do not fall back to the no-parent path. The parent stays open and is surfaced by Task 3's backstop on the next `/tidy` run. Pinned in Task 1 (prose) and Task 2 (verify fails `not closed`).
3. **Unscored sibling** (`risk:*` missing on any sub-issue). Expected: `maxRiskTier` is `undefined`, so `exceedsOversightFloor` fails closed to `exceeds: true` and the brief path runs. The parent is never closed silently. Pinned in Task 3's scan behavior test.
4. **Untrusted comment carrying the marker heading** (a planted heading). Expected: it does not count as the listing comment, neither for the procedure's re-entry check nor for engine-verify. Pinned in Task 2.
5. **Close lands before the last sub-issue's merge** (every mid-close caller labels before merging). Expected: the prose states this ordering, and that reopening the parent is the recovery when that merge never lands. Pinned in Task 1.

## Spec coverage map

| Spec item | Task |
|---|---|
| Deliverable 1 (`github-issues` comment then close; `local-files` `closeRecord`) | Task 1 |
| Approach: "optionally" have tidy's `parent-gate` scope surface stranded below-floor parents | Task 3 |
| AC1.1 (parent closed, with a comment listing the sub-issues) | Task 1 (prose pin), Task 2 (mechanized verify) |

---

### Task 1: Parent-Gate Procedure closes a below-floor parent

**Role:** judgment
**Review risk:** high

**Files:**
- Modify: `plugin/skills/wrap-up/verification-brief-parent-gate.md`: the `**exceeds: false**` bullet in `## Evaluate the gate`, and the `## Enumerate the parent's sub-issues` per-sub-issue fetch (`gh issue view {n} --json state,labels` becomes `state,labels,title,closedByPullRequestsReferences`, a field already used by `tidy/issue-claims-backstops.md`). Also add a new `## Close the parent below the floor` section between `## Evaluate the gate` and `## Compose the parent brief`.
- Modify: `plugin/skills/demo/SKILL.md:264`. The Approve bullet's "nothing else in the system ever closes a parent" becomes accurate: the Parent-Gate Procedure closes a below-floor parent; /demo's Approve is the only close for a parent that cleared the floor.
- Modify: `plugin/skills/_shared/github-pr-scan-acceptance.md:84`. The acceptance-gap `--state all` rationale also names the below-floor close.
- Test: Create `tests/below-floor-parent-close-conformance.test.js`.

**Interfaces:**
- Produces: the heading `## Closed below the oversight floor`, and the section name `## Close the parent below the floor` that Task 3's tidy action prose cites.

- [ ] **Step 1: Write the failing test** in `tests/below-floor-parent-close-conformance.test.js`. Use `readText` from `tests/helpers/read-skill.js` and the `between(doc, start, end)` slice style of `tests/try-it-contract-conformance.test.js`:

```js
test('AC1.1: the exceeds: false branch closes the parent through the close section', () => {
  const gate = read('wrap-up/verification-brief-parent-gate.md');
  const below = between(between(gate, '## Evaluate the gate', '## Close the parent below the floor'), '**`exceeds: false`**', '**`exceeds: true`**');
  assert.doesNotMatch(below, /closes cleanly/);
  assert.match(below, /\*\*Close the parent below the floor\*\*/);
  assert.match(below, /no `demo:pending`, no brief/);          // existing try-it pin kept
  assert.match(below, /end-to-end variant/);                   // existing try-it pin kept
  assert.match(below, /Parent-side entry/);                    // existing try-it pin kept
});
test('AC1.1: the close section comments before closing, on both drivers', () => {
  const close = between(gate, '## Close the parent below the floor', '## Compose the parent brief');
  assert.ok(close.includes('## Closed below the oversight floor'));
  const comment = close.indexOf('gh issue comment $PARENT_NUM --body-file');
  const shut = close.indexOf('gh issue close $PARENT_NUM --reason completed');
  assert.ok(comment !== -1 && shut > comment, 'comment must precede close');
  const write = close.indexOf('writeRecord(parentPath');
  const closeRec = close.indexOf('closeRecord(parentPath)');
  assert.ok(write !== -1 && closeRec > write, 'local-files body write must precede closeRecord');
  assert.match(close, /closedByPullRequestsReferences/);
  assert.match(close, /already `CLOSED`/);          // Review Focus 1
  assert.match(close, /Trusted authors/);           // Review Focus 4
  assert.match(close, /reopen/i);                   // Review Focus 5
  assert.match(close, /which step failed/);         // Review Focus 2
});
test('demo no longer claims nothing else closes a parent', () => {
  const demo = read('demo/SKILL.md');
  assert.doesNotMatch(demo, /nothing else in the system ever closes a parent/);
  assert.match(demo, /Close the parent below the floor/);
});
```

Add a go-red control per `tests/try-it-contract-conformance.test.js`'s pattern: read the base text with `git show fae7a76ba:plugin/skills/wrap-up/verification-brief-parent-gate.md` (`execFileSync`, guarded with try/catch for a shallow clone, as `tests/tidy-needs-worklist-rule.test.js` does), and assert that the base `exceeds: false` slice matches `/closes cleanly/`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/below-floor-parent-close-conformance.test.js`
Expected: FAIL (`## Close the parent below the floor` not found / `closes cleanly` still present)

- [ ] **Step 3: Write the prose.**
  - **`exceeds: false` bullet:** replace "the parent closes cleanly: no `demo:pending`, no brief, same as a below-floor sub-issue record on the non-parent path. Do not compose the parent brief." with "no `demo:pending`, no brief … Do not compose the parent brief; run **Close the parent below the floor** below instead, on both entry shapes." Keep the Try-it walkthrough sentence for the sub-issue-side entry. Change the parent-side sentence from "stop here — no delivering run exists to carry it" to: the parent-side entry carries no walkthrough (no delivering run exists to carry it), but it still runs the close.
  - **New `## Close the parent below the floor` section:**
    1. **Idempotence first:** fetch `gh issue view $PARENT_NUM --json state,comments`. An already `CLOSED` parent is a no-op. When a comment from a trusted author (`_shared/pr-run-comments.md`'s Trusted authors) already contains `## Closed below the oversight floor`, skip the comment and run only the close. Untrusted copies are named in the skip notice, the same way the already-posted brief check handles them.
    2. **Comment body template:** the heading; one sentence naming the highest sub-issue risk tier (`risk:{maxTier}`) and the resolved `risk-floor`, and stating that no Verification Brief or `demo:pending` sign-off is owed; then one bullet per enumerated sub-issue, `- #{n} {title} — closed by PR #{pr}` from `closedByPullRequestsReferences`. A `$CLOSING_SUB_ISSUES` member reads `closing with PR #{run-state pr}` when the run's `run-state.json` carries a `pr`, otherwise `closing in this run`. A sub-issue with no recorded PR reads `no closing PR recorded`. Last line: `Closed by {poster}`, using the same poster substitution as **Compose the parent brief**.
    3. **Write it** with the Write tool to the session-scoped `parent-close-comment.md`, then run `gh issue comment $PARENT_NUM --body-file "$PARENT_CLOSE_COMMENT"`, then `gh issue close $PARENT_NUM --reason completed`.
    4. **Partial-state note:** two independent calls. Report exactly which step failed. A close failure does not fall back to the no-parent path, because the gate decision is already made. The step-1 re-entry check is the recovery, and `/tidy`'s `parent-gate` backstop surfaces the still-open parent.
    5. **Timing:** every mid-close sub-issue-side caller runs before its merge, so the close lands before the last sub-issue's merge, exactly as `demo:pending` does on the brief path. If that merge never lands, reopen the parent (`gh issue reopen $PARENT_NUM`).
    6. **`local-files`:** an already `facets.closed` parent is a no-op. If the body already contains the heading, skip the append. Otherwise append the same section to the parent body with `writeRecord(parentPath, …)`, then `closeRecord(parentPath)`. `parentPath` is resolved the way **Apply the gate** resolves it, and the list bullets use record ids.
  - **Fail-open paragraph** near the top: add that the close section's own call failures follow item 4 above, not the no-parent fallback.
  - **Demo line 264:** rewrite only the "nothing else in the system ever closes a parent, so without this …" clause, naming `wrap-up/verification-brief-parent-gate.md`'s **Close the parent below the floor** as the below-floor closer.
  - **Acceptance scan line 84:** add "or the Parent-Gate Procedure's below-floor close" beside "`demo/SKILL.md`'s Approve step".

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/below-floor-parent-close-conformance.test.js tests/try-it-contract-conformance.test.js tests/comment-trust-conformance.test.js tests/session-tmp-root-migration.test.js tests/skill-fence-guard-shapes.test.js tests/demo-full-verification-pointer.test.js tests/fetch-sub-issues-prose-conformance.test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit** the four files: `Close below-floor decomposition parents in the parent gate — refs #4466`

---

### Task 2: engine-verify checks a below-floor parent is closed with its listing comment

**Role:** integration
**Review risk:** high

**Files:**
- Modify: `plugin/bin/lib/wrap-up/engine-verify.js`, the `acceptance-labeling` check's `if (!exceeds)` branch (currently `skipped.push(\`parent #${target} below oversight floor\`); continue;`) and the #3222 header comment above `registerCheck('acceptance-labeling', …)`.
- Test: `tests/bin-lib/wrap-up/engine-verify.test.js`. Extend the `parentGateRow` helper (line ~1757) and replace `AC3.1: acceptance-labeling skips a due parent below the oversight floor`.

**Interfaces:**
- Consumes: Task 1's heading `## Closed below the oversight floor`; `scanMarkerComments(comments, hasMarker)` and `isTrustedComment` (already in the file).
- Produces: below-floor detail strings `parent #{target} closed below oversight floor` (counted as checked, not skipped), plus the failing lines `#{target}: below oversight floor but not closed` and `#{target}: below oversight floor with no trusted "## Closed below the oversight floor" comment`.

- [ ] **Step 1: Write the failing tests.** Give `parentGateRow` two new options: `parentState` (default `'OPEN'`), returned for a `gh issue view {n} --json state` call (args include `'state'` as the `--json` value), and `parentComments` (default `[]`), returned in the existing `labels,comments` reply. Replace the old AC3.1 test with:

```js
test('AC1.1: acceptance-labeling passes a due below-floor parent that is closed with a trusted listing comment', () => {
  const { row } = parentGateRow({ records: [900], parentState: 'CLOSED',
    parentComments: [{ body: '## Closed below the oversight floor\n- #900 x\n- #901 y\n', authorAssociation: 'MEMBER' }],
    subIssues: [{ number: 900, state: 'open', labels: ['risk:medium'] }, { number: 901, state: 'closed', labels: ['risk:medium'] }] });
  assert.strictEqual(row.result, 'pass', row.detail);
  assert.match(row.detail, /parent #898 closed below oversight floor/);
});
test('AC1.1: acceptance-labeling fails a due below-floor parent that is still open', () => {
  // same subIssues, parentState 'OPEN', trusted comment present
  assert.strictEqual(row.result, 'fail'); assert.match(row.detail, /#898: below oversight floor but not closed/);
});
test('AC1.1: acceptance-labeling fails a closed below-floor parent with only an untrusted listing comment', () => {
  // parentState 'CLOSED', comment authorAssociation 'NONE'
  assert.strictEqual(row.result, 'fail'); assert.match(row.detail, /no trusted "## Closed below the oversight floor" comment/);
});
test('acceptance-labeling fails when the below-floor parent state read throws', () => {
  // fakeGh throws for the --json state call
  assert.strictEqual(row.result, 'fail'); assert.match(row.detail, /#898: gh issue view state failed/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-name-pattern "below-floor parent|below oversight floor|state read throws" tests/bin-lib/wrap-up/engine-verify.test.js`
Expected: FAIL after Step 1 (result `skip`, detail `parent #898 below oversight floor`) — the tests are appended to an existing passing file, so before Step 1 the pattern matches nothing

- [ ] **Step 3: Implement.** In the `if (!exceeds)` branch, make one extra call, only on this branch: `deps.gh(['issue', 'view', String(target), '--json', 'state'], cwd)`. Parse it with try/catch. A throw yields failing `#{target}: gh issue view state failed ({message})`, and unparseable output yields `#{target}: could not parse state JSON`. Then scan `issueData.comments` with `scanMarkerComments(…, (c) => c.body && c.body.includes('## Closed below the oversight floor'))` and branch:
  - state is not `CLOSED`: failing line.
  - no trusted comment: failing line, with the untrusted skip notes appended the way `fail()` appends them.
  - otherwise: record `parent #{target} closed below oversight floor` as a pass note.

  The parent then counts as checked, so the `skipped.length === targets.length` skip result no longer fires for it. Update the #3222 header comment: a below-floor due parent is now checked for closure, not skipped.

- [ ] **Step 4: Run the full file**

Run: `node --test tests/bin-lib/wrap-up/engine-verify.test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit** both files: `Verify a below-floor parent was closed with its listing comment — refs #4466`

---

### Task 3: /tidy's parent-gate backstop surfaces stranded below-floor parents

**Role:** integration

**Files:**
- Modify: `plugin/skills/_shared/github-pr-scan-acceptance.md`, the `### Oversight-floor pre-filter` under `## Scope: parent-gate` (the `node -e` block ending `-- "$RISK_FLOOR"`, and its prose). Filter to `due` only, then print the existing row for an above-floor parent and the below-floor row otherwise. Prose: below-floor due parents are now surfaced, not filtered out. Also the "Un-gated parents recommend…" paragraph: approving a below-floor row closes the parent through **Close the parent below the floor** and ends with no `/claude-tweaks:demo` step.
- Modify: `plugin/skills/tidy/step-1-records.md`, Shape 7's prose ("filter out below-floor candidates" applies only to Shape 8 now), its `node -e` block (same restructure, keeping `.filter((f) => !f.needsDefinition)` byte-identical; `tests/tidy-needs-worklist-rule.test.js` pins it), and its `→ Collect each as:` line (add the below-floor form).
- Modify: `plugin/skills/tidy/actions-github-issues.md` and `plugin/skills/tidy/actions-local-files.md`, `## Open parent gate`. On a re-verified `due` gate that is below the floor, the action runs the procedure's **Close the parent below the floor** instead of composing a brief. It stays staged.
- Modify: `plugin/skills/tidy/SKILL.md`. In the Action Vocabulary `Open parent gate` row, replace "never closes the parent" with "closes the parent only below the oversight floor (no brief owed)". Add two `- [x] Closed below-floor parent:` applied-report rows, one `github-issues` (re-queried `gh issue view {n} --json state,comments`: `CLOSED` plus a trusted comment headed `## Closed below the oversight floor`, comment before close) and one `local-files` (`readRecord`: `closed: true` plus the body section). Leave both existing `- [x] Opened parent gate:` rows unchanged (`tests/comment-trust-conformance.test.js` requires exactly one `parent #{n}` row).
- Modify: `plugin/skills/tidy/scan-procedures.md`. Add the below-floor `[parent-gate]` collect line beside line 268, plus one clause in the line-261 paragraph.
- Modify: `plugin/skills/tidy/step-6-auto.md`, the `| **Open parent gate** (` row. Add one clause: below the oversight floor the action closes the parent with a sub-issue-listing comment (`closeRecord` under `local-files`), staged for the same reasons. Stay within the Global Constraints byte cap.
- Test: `tests/below-floor-parent-close-conformance.test.js` (append).

**Interfaces:**
- Consumes: Task 1's `## Close the parent below the floor` section and its heading.
- Produces: row text `[parent-gate] #{n}: {title} — parent complete below the oversight floor — Open parent gate (closes it; no brief owed)`. The local form is `{path}\t[parent-gate] {id}: {title} — parent complete below the oversight floor — Open parent gate (closes it; no brief owed)`.

- [ ] **Step 1: Write the failing tests.** Extract each scan's `node -e "…"` block with the `extractNodeScripts` regex from `tests/help-acceptance-queue-local-files.test.js`. Substitute `${CLAUDE_PLUGIN_ROOT}` with the repo's `plugin` path, and run it with `execFileSync('node', ['-e', script, '--', 'high'])`.
  - GitHub scan: substitute `$GATES` with a temp JSON file and use three parents. A below-floor due parent (`risk:medium` sub-issues, all closed, no labels) prints the below-floor row. An above-floor due parent (`risk:high`) prints the existing `Open parent gate, then /claude-tweaks:demo` row. An unscored due parent (one sub-issue with no `risk:*`) prints the above-floor row (Review Focus 3).
  - Shape 7: run in a temp cwd with a `specs/` store built through `local-store.js`'s `writeRecord`/`closeRecord`, using the same three cases.
  - Prose pins: tidy `SKILL.md` no longer contains `never closes the parent`. Both action files cite `Close the parent below the floor`. `step-6-auto.md`'s row names `closeRecord`. Name the tests `AC1.1: …`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/below-floor-parent-close-conformance.test.js`
Expected: FAIL (the below-floor parent prints nothing)

- [ ] **Step 3: Edit the seven files** as listed above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/below-floor-parent-close-conformance.test.js tests/tidy-needs-worklist-rule.test.js tests/comment-trust-conformance.test.js tests/sweep-backstop.test.js tests/tidy-release-note-repair-conformance.test.js tests/help-acceptance-queue-local-files.test.js tests/fetch-sub-issues-prose-conformance.test.js tests/session-tmp-root-migration.test.js`
Expected: PASS, 0 failures. Also run `wc -c plugin/skills/tidy/step-6-auto.md` and expect under 49400.

- [ ] **Step 5: Commit** the eight files: `Surface stranded below-floor parents in tidy's parent-gate backstop — refs #4466`
