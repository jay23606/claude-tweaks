# Merge small adjacent tasks at plan-authoring time (#3379) Implementation Plan

**Goal:** Add plan-authoring guidance to `plugin/skills/build/plan-authoring-checks.md`: write two small adjacent same-file tasks as one task when the second only builds on the first and adds no separately reviewable surface.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T084628-record-2956/spec-3379/work/3379-spec.md` (materialized from GitHub issue #3379)

**Prerequisites verified at build time:** #3123 and #3310 are both CLOSED (merged). #3123 shipped its fast-lane transcription batching guidance as an extension of the existing `**Batched-plan marker.**` paragraph (line 19 of `plan-authoring-checks.md`) — that bold label is the heading the cross-reference names. Byte-pin check: the file is 36,677 B against `RAIL_BYTES` 52,500 B (`plugin/bin/lib/skill-audit/budgets.js`) — 15,823 B headroom before this edit; the new paragraph is ~1.4 KB.

---

### Task 1: Add the Adjacent-task merge paragraph, its prose pin, and the countTasks guard

**Files:**
- Modify: `plugin/skills/build/plan-authoring-checks.md`
- Test: `tests/ceremony-profile-roster.test.js`
- Test: `tests/bin-lib/plan-audit/parser.test.js`

- [ ] **Step 1: Failing test** — append to `tests/ceremony-profile-roster.test.js`, directly after the #3123 Batched-plan block (reuse its `PLAN_CHECKS` and `readText`):

```js
// #3379: the Adjacent-task merge paragraph sits after the Batched-plan marker paragraph.
const ADJACENT_LABEL = '**Adjacent-task merge.**';
const ADJACENT_PINS = [
  ['two adjacent tasks touch the same files', 'same-files condition'],
  ["the second only builds on the first's output", 'builds-on-output condition'],
  ['the second adds no separately reviewable surface', 'no-separate-surface condition'],
  ['has tests or behavior of its own that a reviewer would judge separately', 'own-tests-or-behavior exclusion'],
  ['touches different files', 'different-files exclusion'],
  ['is independently risky', 'independently-risky exclusion'],
  ["it takes no marker and leaves `plan-audit.js --count-tasks`' `batched` value unchanged", 'no-marker statement'],
  ['merge only while at least two tasks remain', 'keep-two-tasks rule'],
  ['the **Batched-plan marker.** paragraph', 'cross-reference to #3123'],
];
function adjacentMergeParagraph(text) {
  const hits = text.split('\n').filter((l) => l.startsWith(ADJACENT_LABEL));
  assert.strictEqual(hits.length, 1, 'expected exactly one **Adjacent-task merge.** paragraph');
  return hits[0];
}
function adjacentMergeProblems(paragraph) {
  return ADJACENT_PINS.filter(([anchor]) => !paragraph.includes(anchor)).map(([, problem]) => problem);
}

test('AC1.1 + AC2.1 + AC3.1 (#3379): the Adjacent-task merge paragraph names the three conditions, the exclusions, the no-marker statement, the keep-two rule, and the #3123 cross-reference', () => {
  assert.deepStrictEqual(adjacentMergeProblems(adjacentMergeParagraph(readText(PLAN_CHECKS))), []);
});

test('AC3.2 (#3379): the Adjacent-task merge paragraph sits immediately after the Batched-plan marker paragraph', () => {
  const lines = readText(PLAN_CHECKS).split('\n').filter((l) => l.trim() !== '');
  const batched = lines.findIndex((l) => l.startsWith('**Batched-plan marker.**'));
  assert.notStrictEqual(batched, -1);
  assert.ok(lines[batched + 1].startsWith(ADJACENT_LABEL), 'Adjacent-task merge must directly follow the Batched-plan marker paragraph');
});

test('AC4.1 (#3379): the pin goes red for each clause when its text is removed (doctored-text proof)', () => {
  const paragraph = adjacentMergeParagraph(readText(PLAN_CHECKS));
  for (const [anchor, problem] of ADJACENT_PINS) {
    const doctored = paragraph.replace(anchor, 'removed');
    assert.notStrictEqual(doctored, paragraph, `doctoring found no anchor text for ${problem}`);
    assert.deepStrictEqual(adjacentMergeProblems(doctored), [problem]);
  }
});
```

  And append to `tests/bin-lib/plan-audit/parser.test.js` after the #3123 `AC2.1` test (a guard: green before the guidance exists — merging tasks changes only `tasks`):

```js
test('AC2.2: a plan with two adjacent tasks merged into one counts one fewer task and stays batched: false without a marker (#3379)', () => {
  const separate = '# Plan\n\n### Task 1: Add a column\n\n### Task 2: Expose it as a constant\n\n### Task 3: Wire the reader\n';
  const merged = '# Plan\n\n### Task 1: Add a column and expose it as a constant\n\n### Task 2: Wire the reader\n';
  assert.deepStrictEqual(countTasks(separate), { tasks: 3, batched: false });
  assert.deepStrictEqual(countTasks(merged), { tasks: 2, batched: false });
  assert.deepStrictEqual(countTasks('# Plan\n\n**Execution:** batched\n\n' + merged.replace('# Plan\n\n', '')), { tasks: 2, batched: true });
});
```

  Run: `node --test tests/ceremony-profile-roster.test.js tests/bin-lib/plan-audit/parser.test.js`
  Expected: FAIL — the three roster tests fail (`expected exactly one **Adjacent-task merge.** paragraph`); the parser guard passes.

- [ ] **Step 2: Implement** — insert this paragraph into `plugin/skills/build/plan-authoring-checks.md` as its own paragraph immediately after the `**Batched-plan marker.**` paragraph (one blank line before and after; do not change a word of the Batched-plan marker paragraph):

```markdown
**Adjacent-task merge.** When two adjacent tasks touch the same files, the second only builds on the first's output (consumes it, or is made safe by it), and the second adds no separately reviewable surface (no behavior or test a reviewer would judge on its own), write them as one task — e.g. "add a column" plus the one-line type or constant that exposes it; "add a job" plus "remove the code it replaces"; "add a column" plus "a pure function over it" only when both tasks' tests sit in the same test file the first task already edits. Each separate task costs an implementer dispatch and a task review even when the second only consumes the first's output (#3379). This is plan granularity, not SDD's batch rule — the **Batched-plan marker.** paragraph covers same-shape edits across files and fast-lane transcription plans (#3123); this one covers sequential same-file tasks: it takes no marker and leaves `plan-audit.js --count-tasks`' `batched` value unchanged, and only the `tasks` count drops. Keep the tasks separate when the second has tests or behavior of its own that a reviewer would judge separately, touches different files, or is independently risky; a merged task still gets its one task review. Under `ceremony-profile: fast-lane` a plan that reaches `tasks: 1` with `batched: false` skips the whole-branch review (roster tag `sdd-whole-branch-review`), so never merge a multi-task plan down to a single task to reach that skip — merge only while at least two tasks remain.
```

- [ ] **Step 3: Run** `node --test tests/ceremony-profile-roster.test.js tests/bin-lib/plan-audit/parser.test.js tests/plan-authoring-ac-clause-ids-prose.test.js tests/plan-authoring-reader-inventory-prose.test.js tests/skill-size-single-source.test.js` — PASS. Run `wc -c plugin/skills/build/plan-authoring-checks.md` and report the headroom against 52,500 B.
- [ ] **Step 4: Commit** — one commit, `Add adjacent-task merge guidance to plan-authoring checks — refs #3379`.

---

## Self-review

- **Spec coverage:** Deliverable 1 (paragraph + three conditions + examples) → Step 2; Deliverable 2 (not SDD's batch rule, no marker, exclusions, tasks-count interaction, keep-two rule) → Step 2; Deliverable 3 (cross-reference by shipped heading) → Step 2 + AC3.1 pin; Deliverable 4 (prose pin + go-red) → Step 1 roster tests; Deliverable 5 (byte-pin headroom) → plan header + Step 3. AC1-AC5 → Step 1 tests and Step 3 run; `npm test` runs at Common Step 5.
- **Placeholders:** none.
