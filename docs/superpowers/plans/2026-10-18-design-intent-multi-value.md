# Multi-value Design-intent Lift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift a comma-separated `Design-intent:` body line into the materialized header as a validated, normalized list (`design-intent: quiet, minimal`) instead of truncating it to its first token, and hard-fail materialization on invalid values.

**Architecture:** A new pure `normalizeDesignIntent(raw)` in `materialize-format.js` splits/trims/dedupes/validates against the `design-intent` enum read from `policy-schema.js`'s `POLICY_KEYS`. `liftMetadata` captures the whole same-line value and stores either the normalized header string (`designIntent`) or a `designIntentError`. `bin/materialize.js` checks `designIntentError` right after the shape gate and exits 1 (same posture as the shape gate). Prose: the Manifesto states the lever is a run default and the per-record header list is authoritative for polish dispatch; polish ignores empty list entries (legacy `quiet,` headers).

**Tech Stack:** Node 18+ CommonJS, `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-10-18T194538-record-3018/work/3018-spec.md` (record #3018)

## Global Constraints

- Enum is sourced from `plugin/bin/lib/policy-schema.js` (`POLICY_KEYS` row `key: 'design-intent'`, values `none | bold | quiet | minimal | delightful | onboarding`) — read, never re-listed, never modified.
- Every metadata capture keeps the `[ \t]*` same-line guard (refs #357 comment at `materialize-format.js:124-128`); never `\s*`.
- Header list shape is comma plus single space (`design-intent: quiet, minimal`); a single value is written exactly as today. No YAML-list syntax, no quoting.
- Invalid value (outside the enum) or `none` mixed with any other value fails materialization naming the record and the offending value. Never silently dropped.
- Existing test `liftMetadata: a bare Design-intent: line (no value) does not swallow the next metadata line (refs #357)` stays byte-unchanged.
- Commit messages: `{Verb} {what} — {detail}`, reference `refs #3018` (never `closes`/`fixes`).

## Review Focus

- Mixed case (`Design-intent: Quiet`) — strict: fails naming `Quiet` (enum is lowercase; `/specify` writes lowercase). Pinned in Task 1.
- Duplicate entries (`quiet, quiet`) — deduped preserving first-seen order, so polish never dispatches a command twice. Pinned in Task 1.
- Only separators (`Design-intent: ,`) — no values declared → lifts nothing (same as a bare line), not an error. Pinned in Task 1.
- Legacy already-materialized `design-intent: quiet,` headers in old run dirs — no code reader re-parses the header (grep of `plugin/bin` confirms), so the only reader is polish's prose; Task 3 tells polish to ignore empty entries.
- Tab-separated or extra-space values (`quiet ,\tminimal,`) — trimmed. Pinned in Task 1.

---

### Task 1: Normalize and validate Design-intent in `materialize-format.js`

**Files:**
- Modify: `plugin/bin/lib/issues/materialize-format.js` (`liftMetadata` Design-intent capture, `:131-132`; new `normalizeDesignIntent`; `module.exports`)
- Test: `tests/bin-lib/issues/materialize-format.test.js`

**Interfaces:**
- Produces: `DESIGN_INTENT_VALUES: string[]` — exported, the enum read once from `policy-schema.js`.
- Produces: `normalizeDesignIntent(raw: string) -> { ok: true, values: string[] } | { ok: false, invalid: string[], reason: 'unknown' | 'none-mixed' }` — exported. `values` is trimmed, empty entries dropped, deduped in first-seen order. `reason: 'unknown'` lists every value outside the enum in `invalid`; `reason: 'none-mixed'` (only checked when no unknown values) sets `invalid: ['none']`.
- Produces: `liftMetadata(body)` — for a valid non-empty list, `designIntent` is `values.join(', ')` (so `'quiet'` stays `'quiet'`); for an empty list, no `designIntent` key; for an invalid list, no `designIntent` key and `designIntentError: { raw: string, invalid: string[], reason }` where `raw` is the trimmed captured line value.
- `composeHeader` is unchanged — it already writes `design-intent: ${designIntent}` verbatim.

- [ ] **Step 1: Append failing tests (AC1.1, AC2.1, AC2.2, AC2.4, AC3.1)** to `tests/bin-lib/issues/materialize-format.test.js` (import `normalizeDesignIntent` alongside the existing imports):

```js
test('liftMetadata: a comma-separated Design-intent list lifts every value (#3018)', () => {
  const lifted = liftMetadata('Surface: web\nDesign-intent: quiet, minimal\n\n## Current State\nx');
  assert.equal(lifted.designIntent, 'quiet, minimal');
  const header = composeHeader({ record: 1, origin: 'human', ceremony: 'standard', grants: {}, designIntent: lifted.designIntent });
  assert.match(header, /^design-intent: quiet, minimal$/m);
});
test('liftMetadata: extra spaces, tabs and a trailing comma normalize (#3018)', () => {
  assert.equal(liftMetadata('Design-intent: quiet ,\tminimal,\n\nx').designIntent, 'quiet, minimal');
});
test('liftMetadata: duplicate intents dedupe in first-seen order (#3018)', () => {
  assert.equal(liftMetadata('Design-intent: bold, quiet, bold\n\nx').designIntent, 'bold, quiet');
});
test('liftMetadata: a separators-only Design-intent line lifts nothing (#3018)', () => {
  const lifted = liftMetadata('Surface: web\nDesign-intent: ,\n\nx');
  assert.deepEqual(lifted, { surface: 'web' });
});
test('liftMetadata: an unknown intent yields designIntentError naming it, no designIntent (#3018)', () => {
  const lifted = liftMetadata('Design-intent: quiet, sparkly\n\nx');
  assert.equal('designIntent' in lifted, false);
  assert.deepEqual(lifted.designIntentError, { raw: 'quiet, sparkly', invalid: ['sparkly'], reason: 'unknown' });
});
test('liftMetadata: mixed-case intent is unknown (strict enum) (#3018)', () => {
  assert.deepEqual(liftMetadata('Design-intent: Quiet\n\nx').designIntentError.invalid, ['Quiet']);
});
test('liftMetadata: none combined with another intent is an error (#3018)', () => {
  assert.deepEqual(liftMetadata('Design-intent: none, bold\n\nx').designIntentError, { raw: 'none, bold', invalid: ['none'], reason: 'none-mixed' });
});
test('normalizeDesignIntent: enum comes from policy-schema (#3018)', () => {
  const { POLICY_KEYS } = require('../../../plugin/bin/lib/policy-schema');
  const values = POLICY_KEYS.find((k) => k.key === 'design-intent').values;
  for (const v of values) assert.deepEqual(normalizeDesignIntent(v), { ok: true, values: [v] });
  assert.equal(normalizeDesignIntent('onboarding, delightful').ok, true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/bin-lib/issues/materialize-format.test.js`
Expected: FAIL — `normalizeDesignIntent is not a function` and `'quiet,' !== 'quiet, minimal'`.

- [ ] **Step 3: Implement** `normalizeDesignIntent` and change the `Design-intent:` capture in `liftMetadata` to `/^Design-intent:[ \t]*(.+)$/m` (keep the `[ \t]*` guard; the refs-#357 comment already covers `(.+)$`). Read the enum once at module load: `require('../policy-schema').POLICY_KEYS.find((k) => k.key === 'design-intent').values`. Split on `,`, trim each (`.trim()` covers tabs), drop empties, dedupe. Update the `liftMetadata` doc comment to mention `designIntentError`.

- [ ] **Step 4: Run to verify they pass (AC3.2 — refs-#357 test unchanged)**

Run: `node --test tests/bin-lib/issues/materialize-format.test.js`
Expected: PASS, including the unchanged refs-#357 bare-line test.

- [ ] **Step 5: Verify the headline test goes red against the old capture (AC1.2)** — temporarily edit the capture back to the old `(\S+)` (do not stash), confirm `a comma-separated Design-intent list lifts every value` goes red, then restore the new code and re-run green.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/issues/materialize-format.js tests/bin-lib/issues/materialize-format.test.js
git commit -m "Lift every Design-intent value — validate against the policy enum (refs #3018)"
```

### Task 2: Hard-fail materialization on an invalid Design-intent

**Files:**
- Modify: `plugin/bin/materialize.js` (after the `shapeGate` block at `:361-365`; move the `liftMetadata(record.body)` call up from `:547` so the check runs before any drift/premise/sibling logging, and reuse that `meta` at header composition; update the exit-code comment at `:11-13`)
- Create: `tests/materialize-design-intent.test.js`

**Interfaces:**
- Consumes: `liftMetadata(body).designIntentError` from Task 1.
- Produces: exit code `1` with stderr exactly `materialize.js: Record #{n} has an invalid Design-intent: line ("{raw}") — {detail} — fix the record's Design-intent: line (run \`/claude-tweaks:specify #{n}\`).\n`, where `{detail}` is `unknown value(s) {invalid joined by ", "} (allowed: {enum joined by ", "})` for `reason: 'unknown'` and `"none" cannot be combined with other intents` for `reason: 'none-mixed'`. No file is written.

- [ ] **Step 1: Write failing tests (AC2.3, AC2.4, AC4.1)** in `tests/materialize-design-intent.test.js`, reusing the `--record-json` + fake-deps harness shape from `tests/materialize-record-json.test.js` (gitRepo fixture from `tests/helpers/git-fixtures`, run inside it, `--run-dir` under that repo). Three tests:
  - `two-value Design-intent materializes as "design-intent: quiet, minimal" (#3018)` — body `Surface: web\nDesign-intent: quiet, minimal\n\n## Current State…` (spec-shaped), labels include `ceremony:standard`; assert exit 0 and the written `work/{n}-spec.md` matches `/^design-intent: quiet, minimal$/m`.
  - `unknown Design-intent value exits 1 naming the record and value, writes nothing (#3018)` — `Design-intent: quiet, sparkly`; assert exit 1, stderr includes `Record #` + n and `sparkly`, and no `work/` file exists.
  - `none mixed with another intent exits 1 (#3018)` — `Design-intent: none, bold`; assert exit 1 and stderr includes `"none" cannot be combined`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/materialize-design-intent.test.js`
Expected: FAIL — the invalid-value tests get exit 0 (the two-value test may fail or pass depending on Task 1; the invalid ones must fail).

- [ ] **Step 3: Implement** the check in `run()` right after the shape-gate return, building the message from `designIntentError` and Task 1's exported `DESIGN_INTENT_VALUES`.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/materialize-design-intent.test.js tests/materialize-record-json.test.js tests/materialize-drift.test.js tests/materialize-premise-check.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/materialize.js tests/materialize-design-intent.test.js
git commit -m "Fail materialize on an invalid Design-intent list — same gate posture as the shape gate (refs #3018)"
```

### Task 3: State the lever-vs-header rule and pin polish's multi-intent input

Deliverable 4 decision: **polish reads the per-record header list (not the run lever) for intent dispatch** — this is already what `design-wrapper/modes/polish.md` Step "Intent-driven" does; the Manifesto now states it.

**Files:**
- Modify: `plugin/skills/flow/manifesto.md:59` (Design intent (4) suppression row) and `:147` (Recommendation defaults row)
- Modify: `plugin/skills/design-wrapper/modes/polish.md:147` (Multi-intent ordering paragraph)
- Modify: `plugin/skills/flow/materialize.md:54` area (hard gate) and `:125` (lift rule sentence for `design-intent:`)
- Create: `tests/design-intent-multi-value-conformance.test.js`

**Interfaces:**
- Consumes: Task 1/2 behavior (normalized comma list; exit-1 gate) for the prose to describe.

- [ ] **Step 1: Write the failing conformance test (AC4.1)** reading the three live skill files (live corpus is legitimate here — the assertion is about current shipped prose). Assertions (case-insensitive, content-anchored):
  - `manifesto.md`'s line starting `| **Design intent** (4)` matches `/run[- ]level default/i` and `/header.{0,80}authoritative/i`.
  - `polish.md`'s `**Multi-intent ordering.**` paragraph matches `/materialized header/i` and `/empty entr/i` (legacy trailing comma tolerated) and still contains `invoke commands in the order declared`.
  - `materialize.md` contains a sentence matching `/splits on/i` followed within 200 chars by `/trims/i` (the normalization), and a sentence matching `/invalid `Design-intent:`/i` followed within 300 chars by `/exits 1/i` (the hard gate).

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/design-intent-multi-value-conformance.test.js`
Expected: FAIL — no `run-level default` / `empty entr` / normalization text yet.

- [ ] **Step 3: Edit the prose** (in place, one or two sentences each):
  - manifesto.md row 59: append that the `design-intent` lever is a run-level default for records whose header carries no `design-intent:`; a record's header list (`design-intent: quiet, minimal`) is authoritative per record — polish dispatches every value in it (`design-wrapper/modes/polish.md`), never the single-valued lever. Row 147 "Why": add "run-level default only — a record's header list overrides it".
  - polish.md Multi-intent ordering: name the source as the materialized header's `design-intent:` comma list, and say to trim each value and ignore empty entries, so a legacy `design-intent: quiet,` header reads as `quiet`.
  - materialize.md line 125: `design-intent:` is not a verbatim copy — the CLI splits on `,`, trims, drops empties, dedupes, validates each value against the `design-intent` enum in `policy-schema.js`, and writes `value, value`. Near the hard gate (line 54 area) add one bullet: an invalid `Design-intent:` value (outside the enum, or `none` mixed with another) is a hard stop — `bin/materialize.js` exits 1 naming the record and the value, before writing anything.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/design-intent-multi-value-conformance.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/flow/manifesto.md plugin/skills/design-wrapper/modes/polish.md plugin/skills/flow/materialize.md tests/design-intent-multi-value-conformance.test.js
git commit -m "Document the Design-intent header list as authoritative over the run lever (refs #3018)"
```

### Task 4: Full suite

- [ ] **Step 1: Run the full test suite (AC5.1)** — run `npm test` with output redirected to a `.txt` file in the session scratchpad (never `.log`, never `/tmp`), then read its `ℹ fail` summary line and confirm `0`.
