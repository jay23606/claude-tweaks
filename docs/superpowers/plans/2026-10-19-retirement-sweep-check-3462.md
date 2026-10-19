# Retirement-sweep check (#3462) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Retirement-sweep check" to `plugin/skills/build/plan-authoring-checks.md` so a plan that deletes a named mechanism also sweeps every phrasing of it, with the sweep's file list taken from the grep's output.

**Architecture:** One new bold-labelled paragraph in the plan-authoring checks file, placed directly after the `**Reader-inventory derivation check (extends the Consumer-enumeration check):**` paragraph (the sibling rule that also derives a file list from evidence instead of from the spec), plus one prose-conformance test file in the existing `tests/plan-authoring-*-prose.test.js` pattern.

**Tech Stack:** Markdown skill prose; `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T084628-record-2956/spec-3462/work/3462-spec.md` (materialized from GitHub issue #3462)

## Global Constraints

- The check names five phrasings: the identifier, the file path, the option literal, the numeric value as prose, and the issue number used as a label.
- The check says the sweep's file list comes from the grep's output, never from the spec's named list (AC2).
- Rationale cites the memory rules "Deleted-rule citation sweep" and "Grep retired term repo-wide" by name.
- #3311's evidence is cited by PR number and squash commit `f49277005` — never the branch shas `2347b6b1e`/`4572f470b`/`981550f92` the record names, which are not on `main`.
- Byte budget: `plan-authoring-checks.md` is 36,677 B before #3379 and this record (`RAIL_BYTES` 52,500 B, `plugin/bin/lib/skill-audit/budgets.js`); this paragraph is ~1.3 KB.

## Review Focus

- A paragraph that names the phrasings but drops the "grep's output, never the spec's named list" rule — pinned by the key-phrase assertion and its reword control.
- A second paragraph with the same label (duplicate insertion) — pinned by the exactly-one assertion.
- Branch shas cited as evidence — pinned by asserting `f49277005` is present.

---

### Task 1: Add the Retirement-sweep check and its conformance pin

**Files:**
- Modify: `plugin/skills/build/plan-authoring-checks.md` (insert after the `**Reader-inventory derivation check (extends the Consumer-enumeration check):**` paragraph)
- Create: `tests/plan-authoring-retirement-sweep-prose.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the paragraph labelled `**Retirement-sweep check:**`.

- [ ] **Step 1: Write the failing test** — create `tests/plan-authoring-retirement-sweep-prose.test.js`:

```js
// tests/plan-authoring-retirement-sweep-prose.test.js — pins #3462's
// plan-authoring rule: plugin/skills/build/plan-authoring-checks.md tells
// plan authors that a plan deleting a named mechanism carries a sweep task
// over every phrasing of it, with the file list taken from the grep's
// output, never from the spec's named list. Reads the live skill file. The
// paragraph is located by its bold label and every assertion runs on that
// paragraph alone. Both negative controls run the same assertion function
// the positive test runs and expect it to throw: one against the pre-change
// file shape (paragraph absent), one with the key phrase reworded.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEXT = fs.readFileSync(
  path.join(__dirname, '..', 'plugin', 'skills', 'build', 'plan-authoring-checks.md'),
  'utf8',
);

const LABEL = '**Retirement-sweep check:**';
const KEY_PHRASE = "the sweep's file list comes from that grep's output, never from the spec's named list";

const PHRASINGS = [
  'the identifier',
  'the file path',
  'the option literal',
  'the numeric value as prose',
  'the issue number used as a label',
];

function assertRetirementSweepCheck(text) {
  const hits = text.split(/\r?\n\r?\n/).filter((p) => p.startsWith(LABEL));
  assert.strictEqual(hits.length, 1, 'expected exactly one Retirement-sweep check paragraph');
  const p = hits[0];
  assert.ok(p.includes('deletes or retires a named mechanism'), 'names the trigger');
  assert.ok(p.includes('every non-history path'), 'sweeps every non-history path');
  for (const phrasing of PHRASINGS) assert.ok(p.includes(phrasing), `names phrasing: ${phrasing}`);
  assert.ok(p.includes('verification grep names each phrasing'), 'verification grep names each phrasing');
  assert.ok(p.includes(KEY_PHRASE), 'file list comes from the grep output');
  assert.ok(p.includes('"Deleted-rule citation sweep"'), 'cites the Deleted-rule citation sweep rule');
  assert.ok(p.includes('"Grep retired term repo-wide"'), 'cites the Grep retired term repo-wide rule');
  assert.ok(p.includes('#3311') && p.includes('f49277005'), 'cites #3311 by PR and squash commit');
}

test('AC1.1 (#3462): plan-authoring-checks.md carries the Retirement-sweep check', () => {
  assertRetirementSweepCheck(TEXT);
});

test('AC1.1 (#3462): negative control — the pre-change file (paragraph absent) fails the pin', () => {
  const preChange = TEXT.split(/\r?\n\r?\n/).filter((p) => !p.startsWith(LABEL)).join('\n\n');
  assert.notStrictEqual(preChange, TEXT, 'control must actually remove the paragraph');
  assert.throws(() => assertRetirementSweepCheck(preChange));
});

test('AC2.1 (#3462): negative control — rewording the grep-output rule fails the pin', () => {
  const mutated = TEXT.replace(KEY_PHRASE, "the sweep's file list comes from the spec's named list");
  assert.notStrictEqual(mutated, TEXT, 'control must actually reword the phrase');
  assert.throws(() => assertRetirementSweepCheck(mutated));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/plan-authoring-retirement-sweep-prose.test.js`
Expected: FAIL — the positive test throws `expected exactly one Retirement-sweep check paragraph`, and the AC2.1 control fails its `notStrictEqual` precondition (the phrase is absent, so nothing is reworded).

- [ ] **Step 3: Insert the paragraph** into `plugin/skills/build/plan-authoring-checks.md`, as its own paragraph (one blank line before and after) immediately after the `**Reader-inventory derivation check (extends the Consumer-enumeration check):**` paragraph. Exact copy:

```markdown
**Retirement-sweep check:** when a plan deletes or retires a named mechanism — a constant, an option, a CLI, a gate — it must carry a task that sweeps every non-history path in the repo (append-only history such as the changelog records what was true and stays) for each phrasing of that mechanism: the identifier, the file path, the option literal, the numeric value as prose, and the issue number used as a label. The task's verification grep names each phrasing, one `-e` per phrasing (`git grep -n -i -e '{phrasing}' …`), and the sweep's file list comes from that grep's output, never from the spec's named list — a spec names the sites its author remembered, not every site that still cites the mechanism. #3311's plan copied its prose-rewrite file list from the spec's boundary amendment 4, which named three files; about 40 further shipped-skill, doc, journey, and test-comment sites still cited the deleted mechanisms as "warning tier", "40 KB ceiling", "#724 budget", "five bloat signals", or `ceiling: Infinity`, and only the whole-branch review caught them (two Important findings), at the cost of one fix wave, two residual sweeps, and a scoped re-review (#3311, squash `f49277005`). This is the plan-time form of the "Deleted-rule citation sweep" and "Grep retired term repo-wide" rules.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/plan-authoring-retirement-sweep-prose.test.js tests/plan-authoring-reader-inventory-prose.test.js tests/plan-authoring-ac-clause-ids-prose.test.js tests/ceremony-profile-roster.test.js tests/skill-size-single-source.test.js`
Expected: PASS (all). Then `wc -c plugin/skills/build/plan-authoring-checks.md` — record bytes and headroom against 52,500 B.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/build/plan-authoring-checks.md tests/plan-authoring-retirement-sweep-prose.test.js
git commit -m "Add a retirement-sweep check to plan-authoring checks — refs #3462"
```

---

## Self-review

- **Spec coverage:** Deliverable 1 (check + five phrasings + verification grep names each) → Step 3; Deliverable 2 (cite both memory rules) → Step 3; AC1 (named + conformance pin) → Steps 1/3; AC2 (file list from grep output, never the spec's list) → Step 3 + KEY_PHRASE assertion and its reword control.
- **Step scan:** every step is one action; the paragraph is exact copy the spec fixes; the test is complete.
- **Type consistency:** single task; `LABEL` matches the paragraph's bold label exactly.
- **Proportion:** one paragraph, one test file.
