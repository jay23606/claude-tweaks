# Security-Hardening Fleet Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/claude-tweaks:routine fleet on` schedules a daily `code-health focus=security-hardening` sweep, and no fleet prose names a composition-table row by number or count.

**Architecture:** Insert a new Vertical finder row into `plugin/skills/routine/fleet.md`'s composition table (row 5, grouped with the other Vertical finders; later rows renumber), then rewrite every row-number / row-count literal that pointed at the table — in fleet.md and in its citers — into bucket/entry names, per fleet.md's own cardinality-drift rule. Pure markdown/comment edits plus one new `node --test` prose-conformance suite and one existing pin update.

**Tech Stack:** Markdown skill files, YAML comment, `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-10-20T220253-record-3276/work/3276-spec.md` (record #3276)

## Global Constraints

- New row: Bucket `Vertical finder`, Entry `security-hardening`, Source template `` `skills/code-health/routine-template.yml` ``, `focus` override `` `security-hardening` ``, Cron `` `0 7 * * *` ``, PREFIXED_NAME `` `{REPO_SLUG}-code-health-security-hardening` ``.
- Do not change any existing row's cron — Step 4 RECONCILE treats a changed `cron_expression` as drift, so every already-provisioned fleet would rewrite that routine on its next `fleet on`.
- Count-free phrasing: refer to rows by bucket/entry name ("the Vertical finder rows", "the generalist code-health row", "the Grant unit row"), never "row N", "rows N-M", or a cardinal count of rows/instances.
- Commits: `{Verb} {what} — {detail}` style, body line `refs #3276` (never `closes`/`fixes`), ending with `Claude-Session: https://claude.ai/code/session_011BdbSicF7Bima1GrGS3AuQ`.
- `plugin/skills/routine/fleet.md` is 32,768 B against `RAIL_BYTES` 52,500 B (62%) — net growth here is a few hundred bytes; no headroom action needed.

## Review Focus

- A row-number reference to the composition table left outside fleet.md (a citer this plan did not list) — re-run Task 2's three-form greps over the whole repo (excluding `.claude-tweaks/`, `CHANGELOG.md`, `docs/superpowers/`) before committing.
- The summary-template example row and its pin in `tests/backlog-refine-headless.test.js` drifting apart (Task 1 renumbers both together).
- A cron collision with an existing row (AC1.2 test asserts all crons distinct).
- The stagger-rationale paragraph still describing the finder window in a way the 07:00 row contradicts (Task 1 rewrites it).
- Rewording a phrase another test pins by content (Task 2's pin grep lists the one known hit; re-grep after editing).

---

### Task 1: Add the security-hardening Vertical finder row

**Files:**
- Create: `tests/routine-fleet-security-hardening.test.js`
- Modify: `plugin/skills/routine/fleet.md:12-29` (composition table + stagger rationale), `plugin/skills/routine/fleet.md:132-138` (Step 5 summary example row `| 10 | backlog refine (routine) | …`)
- Modify: `tests/backlog-refine-headless.test.js:151-170` (the summary-example pin)

**Interfaces:**
- Produces: `tests/routine-fleet-security-hardening.test.js` with a helper `compositionRows(md: string): Array<{num: string, bucket: string, entry: string, template: string, focus: string, cron: string, name: string}>` that parses the table under `## Fleet composition table` (lines starting `| ` with a numeric first cell). Task 2 appends tests to this same file.

- [ ] **Step 1: Write the failing test**

`tests/routine-fleet-security-hardening.test.js` (`'use strict'`, `node:test`, `node:assert`, reads `plugin/skills/routine/fleet.md` relative to `__dirname/..`; backtick-strip cell values when comparing):

```js
test('AC1.1: composition table has a Vertical finder row whose focus override is security-hardening', () => {
  const row = compositionRows(fleet).find((r) => r.focus === 'security-hardening');
  assert.ok(row, 'no row with focus override security-hardening');
  assert.strictEqual(row.bucket, 'Vertical finder');
  assert.strictEqual(row.template, 'skills/code-health/routine-template.yml');
});

test('AC1.2: its PREFIXED_NAME is {REPO_SLUG}-code-health-security-hardening and its cron is distinct from every other row', () => {
  const rows = compositionRows(fleet);
  const row = rows.find((r) => r.focus === 'security-hardening');
  assert.strictEqual(row.name, '{REPO_SLUG}-code-health-security-hardening');
  assert.strictEqual(row.cron, '0 7 * * *');
  const crons = rows.map((r) => r.cron);
  assert.strictEqual(new Set(crons).size, crons.length, `duplicate cron among ${crons.join(', ')}`);
  // rows stay numbered 1..N with no gaps after the insert
  assert.deepStrictEqual(rows.map((r) => r.num), rows.map((_, i) => String(i + 1)));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routine-fleet-security-hardening.test.js`
Expected: FAIL — `no row with focus override security-hardening`

- [ ] **Step 3: Edit `plugin/skills/routine/fleet.md`**

- Insert after the `experiment-cleanup` row: `| 5 | Vertical finder | security-hardening | \`skills/code-health/routine-template.yml\` | \`security-hardening\` | \`0 7 * * *\` | \`{REPO_SLUG}-code-health-security-hardening\` |`; renumber the following rows 6-13 (generalist code-health … tidy weekly). No other cell changes.
- Stagger rationale: keep the first sentence, then add: "The security-hardening finder takes 07:00 rather than a slot among the other vertical finders: those slots are taken, and moving an existing row's cron would read as drift on every already-provisioned fleet's next reconcile (Step 4's cron comparison), so a new finder takes the next free offset in the window instead." Every later sentence (08:00 shaping unit "after the finder window", 09:00, 10:00, Sunday 11:00) stays true unchanged.
- Step 5 summary example: `| 10 | backlog refine (routine) | Grant lane withheld …` → `| 11 | backlog refine (routine) | Grant lane withheld …` (rest of the line byte-identical).

- [ ] **Step 4: Update the pin in `tests/backlog-refine-headless.test.js`**

Change the positive `source.includes('| 10 | backlog refine (routine) | Grant lane withheld — …')` literal to `| 11 |`; change the `// --- (7) fleet.md row 10's …` comment, the test title, and the assertion message to say "the grant-unit summary row" instead of "row 10". Leave the negative `doesNotMatch` on the old `| 10 | backlog grant | Withheld …` wording as-is (it pins a retired string; still absent).

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/routine-fleet-security-hardening.test.js tests/backlog-refine-headless.test.js tests/routine-fleet-status-off.test.js tests/routine-pause-resume.test.js tests/routine-webhook-trigger.test.js`
Expected: PASS, 0 failures

- [ ] **Step 6: Commit**

```bash
git add tests/routine-fleet-security-hardening.test.js tests/backlog-refine-headless.test.js plugin/skills/routine/fleet.md
git commit -m "Add security-hardening Vertical finder row to the routine fleet — daily 07:00 UTC focus sweep" -m "refs #3276" -m "Claude-Session: https://claude.ai/code/session_011BdbSicF7Bima1GrGS3AuQ"
```

---

### Task 2: Migrate row-number and row-count literals to count-free phrasing

**Files:**
- Modify: `plugin/skills/routine/fleet.md` — naming paragraph (line ~31), Step 3 (~83, "the row 10 record"), Step 4 items 1/3/4 (~93, ~102, ~105), Fleet status membership (~156, "The deliberate exception is row 5"), Fleet off intro (~224, "(Row 5's adoption exception"), Anti-Patterns rows (~259 "a fleet with 12 rows makes 12x", ~264 "12 separate `AskUserQuestion` calls", ~267 "(Row 5's standard-derivation name")
- Modify: `plugin/skills/_shared/routine-template-schema.md:19` (`focus` row: "composition table rows 1-4")
- Modify: `plugin/skills/code-health/routine-template.yml:10` (comment: "composition table rows 1-4")
- Modify: `docs/skill-graph.md` (lines 77, 481-484, 486, 488, 490, 491, 534 — "composition table row N", and :482's "five times … (row 5 …) … (rows 1-4: `dead-code`, …)" enumeration)
- Modify: `docs/journeys/routine-fleet-on.md` (line 12 "twelve separate", line 23 "row 10's … row 12's", line 28 "four focus-scoped code-health finders at 15-minute offsets", line 29 "Row 10")
- Test: `tests/routine-fleet-security-hardening.test.js` (append)

**Interfaces:**
- Consumes: Task 1's `compositionRows` helper and the test file.

- [ ] **Step 1: Append the failing tests**

```js
test('AC2.1: no hardcoded vertical-finder row range or code-health instance count in routine skills or the template schema', () => {
  // mirrors the spec's: git grep -n -E "rows 1-4|rows 1-5|rows 6-12|row 5-12|five code-health instances" -- plugin/skills/routine plugin/skills/_shared/routine-template-schema.md
  const re = /rows 1-4|rows 1-5|rows 6-12|row 5-12|five code-health instances/;
  for (const f of [...routineSkillFiles, schemaPath]) assert.doesNotMatch(read(f), re, f);
});

test('fleet.md prose names composition-table rows by bucket/entry, never by number', () => {
  assert.doesNotMatch(fleet, /\b[Rr]ows? \d/);
  assert.doesNotMatch(fleet, /\b12 (rows|separate)\b|12x/);
});

test('fleet.md citers name composition-table rows by bucket/entry, never by number', () => {
  for (const f of ['docs/skill-graph.md', 'plugin/skills/code-health/routine-template.yml', 'docs/journeys/routine-fleet-on.md']) {
    assert.doesNotMatch(read(f), /composition table(?:'s)? rows? \d/, f);
  }
  assert.doesNotMatch(read('docs/skill-graph.md'), /instantiates it \*\*\w+ times\*\*/);
  const journey = read('docs/journeys/routine-fleet-on.md');
  assert.doesNotMatch(journey, /four focus-scoped|twelve separate/);
  assert.doesNotMatch(journey, /\b[Rr]ows? \d/);
});
```

`routineSkillFiles` = every `*.md` under `plugin/skills/routine/` (`fs.readdirSync`); `schemaPath` = `plugin/skills/_shared/routine-template-schema.md`; `read(rel)` reads relative to the repo root.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routine-fleet-security-hardening.test.js`
Expected: FAIL — AC2.1 matches `rows 1-4` in `fleet.md`

- [ ] **Step 3: Rewrite the literals**

Exact replacement wording (edit in place, keep surrounding sentences):

- fleet.md naming paragraph: "…derivation for the Vertical finder rows only** — code-health's `routine_name` (`code-health-daily`) is fixed across every code-health instance (the Vertical finder rows and the generalist code-health row), so reusing it verbatim would collide once per vertical. The Vertical finder rows use `{REPO_SLUG}-code-health-{focus}` instead (…unchanged…). The generalist code-health row keeps the standard derivation unchanged — …unchanged… Every other row uses the standard derivation unchanged, one instance per template."
- Step 3: "creates the row 10 record at all" → "creates the Grant unit row's record at all".
- Step 4.1: "(the Vertical finder rows via this file's own `{REPO_SLUG}-code-health-{focus}` naming; every other row via `create-and-update.md` CREATE Step 2's standard derivation — both above)".
- Step 4.3 "for rows 1-4 only" → "for the Vertical finder rows only"; Step 4.4 "appended for rows 1-4" → "appended for the Vertical finder rows".
- Fleet status: "The deliberate exception is row 5:" → "The deliberate exception is the generalist code-health row:".
- Fleet off: "(Row 5's adoption exception" → "(The generalist code-health row's adoption exception".
- Anti-Patterns: "a fleet with 12 rows makes 12x the `RemoteTrigger`/git calls for values that don't change across rows" → "a fleet repeats the same `RemoteTrigger`/git calls once per row for values that don't change across rows"; "12 separate `AskUserQuestion` calls would defeat" → "one `AskUserQuestion` call per row would defeat"; "(Row 5's standard-derivation name" → "(The generalist code-health row's standard-derivation name".
- routine-template-schema.md `focus` row: "(`skills/routine/fleet.md`'s composition table rows 1-4 instantiate code-health's template once per vertical, …" → "(`skills/routine/fleet.md`'s composition-table Vertical finder rows instantiate code-health's template once per vertical, …".
- code-health/routine-template.yml comment line 10: "# skills/routine/fleet.md's composition table rows 1-4, plus" → "# skills/routine/fleet.md's composition-table Vertical finder rows, plus".
- docs/skill-graph.md: each "`fleet.md`'s composition table row N" → "`fleet.md`'s composition-table {Bucket or entry} row" — :77/:481 "Grant unit row"; :483 "Dispatch drain row … after the grant unit (Grant unit row)" → "after the grant unit"; :484 "docs-health row"; :486 "harness-health row"; :488 "journey-health row"; :490/:534 "Shaping unit row" (drop the now-redundant "(Shaping unit)"); :491 "Tidy row". :482 → "`fleet on` instantiates it once per code-health row of the fleet composition table: once as the generalist (unmodified) and once per Vertical finder row via the template's `focus` field (`_shared/routine-template-schema.md`), each with its own `{REPO_SLUG}-code-health-{focus}`-shaped name distinct from the standard `{REPO_SLUG}-{routine_name}` derivation." (the vertical list is dropped — the table is the one place membership is enumerated).
- docs/journeys/routine-fleet-on.md: line 12 "instead of twelve separate `/claude-tweaks:routine create` walkthroughs" → "instead of one `/claude-tweaks:routine create` walkthrough per routine"; line 23 "further than row 10's provisioning gate" → "further than the grant unit's provisioning gate" and "so row 12's weekly tidy may arm" → "so the weekly tidy routine may arm"; line 28 "(four focus-scoped code-health finders at 15-minute offsets, the generalist sweeps, …)" → "(the focus-scoped code-health vertical finders, the generalist sweeps, …)"; line 29 "**Check:** Row 10 (the conditional grant unit — …)" → "**Check:** The conditional grant unit (`backlog refine`'s headless posture) …" (drop the now-redundant em-dash parenthetical opener, keep the rest).

- [ ] **Step 4: Run the renumbering-completeness greps (three forms) and the tests**

Run each; every one must print nothing:
```bash
git grep -n -E "[Rr]ows? ([0-9]|1[0-3])([^0-9]|$)" -- plugin/skills/routine plugin/skills/_shared/routine-template-schema.md plugin/skills/code-health/routine-template.yml docs/skill-graph.md docs/journeys/routine-fleet-on.md README.md ':!plugin/skills/routine/schedule-resolution.md'
git grep -n -E "dead-code.{0,5}test-hygiene.{0,5}abstraction-police" -- plugin/skills/routine plugin/skills/_shared docs/skill-graph.md docs/journeys README.md
git grep -n -i -E "(^|[^a-z0-9*])(four|five|twelve|thirteen|12|13)\*{0,2} (code-health|vertical|focus-scoped|rows|instances|separate|routines|times)" -- plugin/skills/routine plugin/skills/_shared/routine-template-schema.md docs/skill-graph.md docs/journeys/routine-fleet-on.md
git grep -n -E "rows 1-4|rows 1-5|rows 6-12|row 5-12|five code-health instances" -- plugin/skills/routine plugin/skills/_shared/routine-template-schema.md
```
Then: `node --test tests/routine-fleet-security-hardening.test.js tests/backlog-refine-headless.test.js tests/routine-template-schema.test.js tests/routine-fleet-status-off.test.js tests/routine-pause-resume.test.js`
Expected: PASS, 0 failures

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/routine/fleet.md plugin/skills/_shared/routine-template-schema.md plugin/skills/code-health/routine-template.yml docs/skill-graph.md docs/journeys/routine-fleet-on.md tests/routine-fleet-security-hardening.test.js
git commit -m "Name fleet composition rows by bucket, not number — count-free citers after the security-hardening insert" -m "refs #3276" -m "Claude-Session: https://claude.ai/code/session_011BdbSicF7Bima1GrGS3AuQ"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| Deliverable 1 (row + daily cron + stagger paragraph) | Task 1 |
| Deliverable 2 (fleet.md + schema literals) | Task 2 (plus the citers the same rule covers: template comment, skill-graph, journey) |
| Deliverable 3 (tests/code pinning composition) | Task 1 Step 4 (`backlog-refine-headless.test.js`); `fleet-counters.js`, `routine-fleet-status-off`, `routine-pause-resume`, `routine-webhook-trigger`, `anti-patterns.test.js` checked — none pin row numbers or counts (anti-patterns counts SKILL.md rows only, and fleet.md's Anti-Patterns row count is unchanged) |
| AC1.1, AC1.2 | Task 1 tests |
| AC2.1 | Task 2 test + Step 4 grep |
| AC3.1 (`npm test` passes) | Waived AC3.1 at task level: run by `/build` Common Step 5 / `/test` on the whole branch, not per task |
