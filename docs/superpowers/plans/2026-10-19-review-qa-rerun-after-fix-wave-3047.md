# Review Step 6.7 QA Re-run After Fix Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/claude-tweaks:review` Step 6.7 re-run the QA stories its applied fix wave touched, and qualify the QA line as stale when that re-run cannot happen.

**Architecture:** Skill-prose change only. `plugin/skills/review/code-mode-steps.md` Step 6.7 gains one numbered item (capture a wave base, intersect the wave's changed files with story `source_files`, re-run via the existing `/claude-tweaks:test qa affected` mode, else fall back to the qualifier); Step 7's verdict comment carries the same QA line. `plugin/skills/review/review-summary-template.md` documents the qualifier and when it renders. A new conformance test pins both.

**Tech Stack:** Markdown skill prose; `node --test` conformance suite.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T114513-record-3047/work/3047-spec.md` (record #3047)

## Global Constraints

- Qualifier wording, verbatim from the spec: `{status} — ran before the review's fix wave ({N} commits since); stories touching changed files: {ids}`.
- The re-run reuses `/claude-tweaks:test qa affected` (`plugin/skills/test/SKILL.md:44`); no new staleness mechanism.
- Corrected premise: the spec's `CEILING_BYTES` (`context-cost.js:31`, 46080 B) no longer exists. The limit in force is the Read-limit rail, `RAIL_BYTES` = 52500 in `plugin/bin/lib/skill-audit/budgets.js` (decision 0024). `code-mode-steps.md` is 42330 B on the base; no per-file byte pin exists for either target file in `tests/` (grepped `byteLength`/`wc -c` next to both basenames). Keep the Step 6.7 addition to one paragraph-sized item (~1.2 KB).
- Out of scope (spec Gotchas): Step 3 Routing's fix-now path; running `design-wrapper review` before `/test`'s QA.
- Commit messages reference the record as `refs #3047`, never a closing keyword.

## Review Focus

1. No stories exist at all (backend/infra record, empty `stories/`) — Step 6.7 must not attempt a re-run. Pinned by AC2.1's test (the "no stories" phrase).
2. Interactive "Fix now" applies a fix (no run dir) — the same rule must apply as for AUTO. Pinned by the Deliverable 3 test.
3. Headless run with no dev server — the re-run self-skips; the summary must render the qualifier, never the pre-wave status unqualified. Pinned by the `never the pre-wave status unqualified` assertion in Task 1.
4. Re-run errors (not a clean skip) — treated the same as a skip: qualifier renders. Pinned by the `or errors` assertion in Task 1.
5. Wave applied but touched no story file — qualifier must never render. Pinned by Task 2's `the qualifier never renders` assertion.

---

### Task 1: Step 6.7 post-wave QA re-run + verdict-comment QA line

**Files:**
- Modify: `plugin/skills/review/code-mode-steps.md` (Step 6.7 list, lines 338-350; Step 7 verdict-comment paragraph, line 364-365)
- Test: `tests/review-qa-rerun-after-fix-wave-conformance.test.js` (Create)

**Interfaces:**
- Produces: the term `stale-QA qualifier` and the variable name `WAVE_BASE`, both of which Task 2's template prose refers to.

- [ ] **Step 1: Write the failing test** — create `tests/review-qa-rerun-after-fix-wave-conformance.test.js`:

```js
'use strict';
// Pins #3047: /review Step 6.7 re-runs the QA stories an applied fix wave
// touched (via /claude-tweaks:test qa affected), and the summary/verdict
// comment qualify QA as stale when that re-run cannot happen.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { RAIL_BYTES } = require('../plugin/bin/lib/skill-audit/budgets');

const REVIEW = path.join(__dirname, '..', 'plugin', 'skills', 'review');
const steps = fs.readFileSync(path.join(REVIEW, 'code-mode-steps.md'), 'utf8');
const step67 = steps.slice(steps.indexOf('## Step 6.7:'), steps.indexOf('## Step 7:'));
const step7 = steps.slice(steps.indexOf('## Step 7:'), steps.indexOf('## Important Notes'));

test('AC1.1: Step 6.7 re-runs affected stories via test qa affected, gated on a fix touching story source_files', () => {
  assert.ok(step67.includes('`/claude-tweaks:test qa affected`'));
  assert.ok(step67.includes('WAVE_BASE=$(git rev-parse HEAD)'));
  assert.ok(step67.includes("`git diff --name-only {WAVE_BASE}..HEAD`"));
  assert.ok(step67.includes("every QA story's `source_files`"));
});

test('Deliverable 3: the rule covers interactive Fix now as well as auto-applied fixes', () => {
  assert.ok(step67.includes('auto-applied (AUTO) or interactive Fix now alike'));
});

test('AC2.1: no intersection (or no stories, or no applied fix) means no QA re-run', () => {
  assert.ok(step67.includes('No intersection — or no stories, or no applied fix — means no QA re-run'));
  assert.ok(step67.includes('no added cost for a non-UI wave'));
});

test('Gotcha: a self-skipped or errored re-run renders the stale-QA qualifier, never the pre-wave status', () => {
  assert.ok(step67.includes('self-skips with no dev server or browser, or errors'));
  assert.ok(step67.includes('stale-QA qualifier'));
  assert.ok(step67.includes('never the pre-wave status unqualified'));
});

test('AC4.1: the verdict comment carries the same qualified QA status, no separate wording', () => {
  assert.ok(step7.includes("the QA status exactly as the summary's QA Validation line renders it (stale-QA qualifier included — no separate wording)"));
  assert.match(step7, /top findings by severity \(max 5\)/);
});

test('AC5.1: code-mode-steps.md stays under the Read-limit byte rail', () => {
  assert.ok(Buffer.byteLength(steps) <= RAIL_BYTES, `${Buffer.byteLength(steps)} > ${RAIL_BYTES}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review-qa-rerun-after-fix-wave-conformance.test.js`
Expected: FAIL (AC1.1, Deliverable 3, AC2.1, Gotcha, AC4.1 red; AC5.1 green)

- [ ] **Step 3: Edit `code-mode-steps.md`**

Insert a new item 4 between Step 6.7's existing item 3 (audit-cache write-back) and the current item 4, renumbering "After resolution, fold each finding back…" to 5 (no other file cites the item number — grepped `6.7 item`, `6.7's item`, `fold each finding back`). New item 4, exact text:

```markdown
4. **Re-run the QA stories the fix wave touched (#3047).** Before this step's first fix lands, capture `WAVE_BASE=$(git rev-parse HEAD)`. Once routing resolves, if any fix was applied — auto-applied (AUTO) or interactive Fix now alike — intersect the files the fix commits touched (`git diff --name-only {WAVE_BASE}..HEAD`) with every QA story's `source_files` (`STORIES_DIR`, default `stories/`). No intersection — or no stories, or no applied fix — means no QA re-run: no added cost for a non-UI wave. Otherwise run `/claude-tweaks:test qa affected` (it selects by `source_files` ∩ `verify.js --changed-files`, per `test/SKILL.md`'s `qa affected` row) and report its result on Step 7's QA Validation line in place of `/test`'s pre-wave status. When the re-run does not happen — it self-skips with no dev server or browser, or errors — render that line with `review-summary-template.md`'s stale-QA qualifier instead, never the pre-wave status unqualified.
```

In Step 7's verdict-comment paragraph, change `Then the verdict, then the top findings by severity (max 5),` to:

```markdown
Then the verdict, then the QA status exactly as the summary's QA Validation line renders it (stale-QA qualifier included — no separate wording), then the top findings by severity (max 5),
```

(keep the rest of the sentence unchanged; re-wrap only the lines touched).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review-qa-rerun-after-fix-wave-conformance.test.js tests/pr-run-comments.test.js tests/review-polish-disposition-conformance.test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/review/code-mode-steps.md tests/review-qa-rerun-after-fix-wave-conformance.test.js
git commit -m "Re-run affected QA stories after review Step 6.7's fix wave — refs #3047"
```

### Task 2: Stale-QA qualifier in the review summary template

**Files:**
- Modify: `plugin/skills/review/review-summary-template.md` (QA Validation section, lines 54-62)
- Test: `tests/review-qa-rerun-after-fix-wave-conformance.test.js` (append)

**Interfaces:**
- Consumes: `stale-QA qualifier` term and `WAVE_BASE` from Task 1's Step 6.7 item 4.

- [ ] **Step 1: Write the failing test** — append to the test file:

```js
const template = fs.readFileSync(path.join(REVIEW, 'review-summary-template.md'), 'utf8');
const qa = template.slice(template.indexOf('### QA Validation (from /test)'), template.indexOf('### Code Review Findings'));

test('AC3.1: the template documents the stale-QA qualifier and when it renders', () => {
  assert.ok(qa.includes('**Stale-QA qualifier (#3047):**'));
  assert.ok(qa.includes(" — ran before the review's fix wave ({N} commits since); stories touching changed files: {ids}"));
  assert.ok(qa.includes('`git rev-list --count {WAVE_BASE}..HEAD`'));
  assert.ok(qa.includes('re-run did not happen'));
  assert.ok(qa.includes('the qualifier never renders'));
});

test('AC4.1: the template states the verdict comment copies the qualified line verbatim', () => {
  assert.ok(qa.includes('The verdict comment (`code-mode-steps.md` Step 7) copies this line verbatim.'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/review-qa-rerun-after-fix-wave-conformance.test.js`
Expected: FAIL (the two new tests red; Task 1's tests green)

- [ ] **Step 3: Edit `review-summary-template.md`**

On the `- **Status:** {ALL PASSED | … | Not run}` line, append `{stale-QA qualifier, when it applies}` right after the closing `}`. After the "Possible QA statuses" bullet list (after `- **Skipped** / **Not run** — QA did not execute`), add a blank line and this paragraph, exact text:

```markdown
**Stale-QA qualifier (#3047):** when `code-mode-steps.md` Step 6.7 applied a fix wave that touched a story's `source_files` and its post-wave `/claude-tweaks:test qa affected` re-run did not happen (self-skipped with no dev server or browser, or errored), append ` — ran before the review's fix wave ({N} commits since); stories touching changed files: {ids}` to the status — `{N}` is `git rev-list --count {WAVE_BASE}..HEAD`, `{ids}` the stories whose `source_files` the wave touched. When the re-run ran, report its own status, unqualified; with no applied wave, or a wave touching no story file, the qualifier never renders. The verdict comment (`code-mode-steps.md` Step 7) copies this line verbatim.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/review-qa-rerun-after-fix-wave-conformance.test.js tests/load-delta-cli.test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/review/review-summary-template.md tests/review-qa-rerun-after-fix-wave-conformance.test.js
git commit -m "Add stale-QA qualifier to the review summary QA line — refs #3047"
```

## Spec coverage

| Spec item | Task / test |
|---|---|
| Deliverable 1 | Task 1, AC1.1 test |
| Deliverable 2 | Task 2, AC3.1 test |
| Deliverable 3 | Task 1, Deliverable 3 test |
| AC1.1 | Task 1 `AC1.1` |
| AC2.1 | Task 1 `AC2.1` |
| AC3.1 | Task 2 `AC3.1` |
| AC4.1 | Task 1 + Task 2 `AC4.1` |
| AC5.1 | Task 1 `AC5.1` (rail, corrected premise); `npm test` runs at Common Step 5 |
