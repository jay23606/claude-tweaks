# preExisting Unattributed-Failure Guard (#3481) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `verify.js` refuses the declared-`preExisting` adjudication whenever any failing check carries a failure no named file accounts for (`unattributed-failures: {N}`), or comes from a log family with no accounting guard (`no-accounting-guard: {family}`).

**Architecture:** The `preExisting` loop in `plugin/bin/verify.js` (currently lines ~560-582) already reads each non-skipped failing check's log and calls `extractFailingFiles`. It gains a per-check `unattributedFailureCount(plain, family)` call, using the same function and the same fail-closed reason strings `planRetry` (`plugin/bin/lib/verify/flaky.js:12-22`) already uses for flaky retry. `matchPreExisting` itself is unchanged.

**Tech Stack:** Node 18+, `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T044701-record-3481/work/3481-spec.md`

## Global Constraints

- Refusal reason strings are exactly `unattributed-failures: {N}` and `no-accounting-guard: {family}`, the same text `planRetry` produces.
- Fail closed: a `null` count (no guard) refuses, and so does any positive count.
- Commit messages: `{Verb} {what} — {detail}`, body carries `refs #3481` (never `closes`/`fixes`).

## Review Focus

- A fully attributed TAP run covered by `preExisting` must still adjudicate (AC3). The existing test `preExisting: a failing file fully covered by the declared allowlist is adjudicated as passing…` (`tests/bin-lib/verify/cli.test.js` ~line 1690) pins this and must stay green unchanged.
- Multiple failing checks: a refusal on any one check refuses the whole run. Sum the positive counts across checks into one `N`.
- Reason precedence matches `planRetry`'s order, applied run-wide: `no-parse` (any check with an unreadable log or zero extracted files) > `no-accounting-guard: {family}` (the first null-count check's family) > `unattributed-failures: {N}` > `matchPreExisting`'s own verdict.
- The stdout line `Pre-existing: not adjudicated — {reason}` (verify.js ~line 915) renders the new reasons with no code change. The tests assert it.

---

### Task 1: Refuse preExisting adjudication on unattributed or unguarded failures

**Files:**
- Modify: `plugin/bin/verify.js` (the `preExisting` block, ~lines 548-582: comment plus loop)
- Modify: `plugin/skills/test/verification.md:163` (the "Declared pre-existing failures" paragraph's reason list)
- Test: `tests/bin-lib/verify/cli.test.js` (extend `preExistingRepo`, add three tests after the existing `preExisting:` tests, ~line 1735)

**Interfaces:**
- Consumes: `unattributedFailureCount(text, family)` from `plugin/bin/lib/verify/extract.js`, which `verify.js` already imports on line 24. It returns `number | null`, with `null` for every family other than `spec`/`tap`.
- Produces: `report.preExistingAdjudicated = { declared, eligible: false, reason }` with `reason` ∈ {`unattributed-failures: {N}`, `no-accounting-guard: {family}`}. This is the existing ineligible shape, with new reason values.

- [ ] **Step 1: Extend the fixture and write the failing tests**

Give `preExistingRepo` an optional `log` parameter: the raw string `fail.js` prints. It defaults to the current TAP string, so existing callers are unchanged. Add these tests, each using `preExisting: ['tests/known-shallow.test.js']`:

```js
test('AC1.1 preExisting: a spec log whose named files are all covered but which also carries an unattributed failure is refused — unattributed-failures: 1 (#3481)', async () => {
  const log = ['ℹ tests 3', 'ℹ pass 1', 'ℹ fail 2', '', '✖ failing tests:', '',
    'test at tests/known-shallow.test.js:1:1', '✖ x (1ms)', '', 'test at tests/helper.js:2:1', '✖ y (1ms)'].join('\n');
  const r = preExistingRepo({ log });
  const { code, stdout } = await runCli(r.args, { cwd: r.repo });
  assert.strictEqual(code, 1);
  assert.match(stdout, /Pre-existing: not adjudicated — unattributed-failures: 1/);
  assert.ok(!fs.existsSync(path.join(r.gitDir, 'claude-tweaks-verify-pass.json')));
  const report = JSON.parse(fs.readFileSync(path.join(r.gitDir, 'claude-tweaks-verify', 'report.json'), 'utf8'));
  assert.deepStrictEqual(report.preExistingAdjudicated, { declared: ['tests/known-shallow.test.js'], eligible: false, reason: 'unattributed-failures: 1' });
  assert.strictEqual(report.effectivePass, false);
});
```

- `AC1.2 preExisting: a TAP log … refused — unattributed-failures: 1 (#3481)`: same assertions. The log is TAP: `not ok 1` with stack frame `at TestContext.<anonymous> (tests/known-shallow.test.js:12:5)`, then `not ok 2` whose stack is `some non-frame diagnostic text`, then `# tests 2` / `# pass 0` / `# fail 2`. The block shape matches the #3066 test at ~line 1430.
- `AC2.1 preExisting: a summary-family log is never adjudicated through preExisting — no-accounting-guard: summary (#3481)`: the log is `FAIL tests/known-shallow.test.js` / `  ● known › fails` / `Tests:       1 failed, 3 passed, 4 total`. Same assertions, with reason `no-accounting-guard: summary`, and stdout matches `/Pre-existing: not adjudicated — no-accounting-guard: summary/`.

These three fixtures were probed against the current `extract.js` before this plan was written. The spec and TAP logs give `sniffFamily` spec/tap, files `["tests/known-shallow.test.js"]`, unattributed count 1. The summary log gives family `summary`, the same files, and count `null`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --test-name-pattern="#3481" tests/bin-lib/verify/cli.test.js`
Expected: FAIL. All three exit 0 today with `Pre-existing: adjudicated — 1 failing file(s) covered…`.

- [ ] **Step 3: Implement the guard in `plugin/bin/verify.js`**

In the `preExisting` loop, compute `const family = sniffFamily(plain)` once per check. Pass it to `extractFailingFiles`, then call `unattributedFailureCount(plain, family)`. Track the first null-count family (`noGuardFamily`) and the sum of positive counts (`unattributedTotal`). After the loop, choose the reason by the Review Focus precedence: `no-parse`, then `no-accounting-guard: ${noGuardFamily}`, then `unattributed-failures: ${unattributedTotal}`, otherwise `matchPreExisting(...)`. Every refusal writes `{ declared: decl.preExisting, eligible: false, reason }`. Update the block comment (~lines 548-559) to name the two new refusals and cite #3481 next to #3066/#3204.

- [ ] **Step 4: Update `plugin/skills/test/verification.md:163`**

After the no-parse sentence, add one sentence: a failing check whose log also carries a failure no named file accounts for refuses the run, and so does a check whose family has no accounting guard (`summary`, for jest/pytest/vitest). This is the same fail-closed accounting the flaky retry applies (#3066, #3204, #3481). In the `report.json` reason list, change `` (`unlisted: […]` or `no-parse`) `` to `` (`unlisted: […]`, `no-parse`, `unattributed-failures: {N}`, or `no-accounting-guard: {family}`) ``. The file is 45,771 bytes against the 51,200-byte ceiling, so this adds well under 1 KB. No test pins this paragraph's text (checked with `git grep` over `tests` and `plugin` for its distinctive phrases).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/verify/cli.test.js tests/bin-lib/verify/pre-existing.test.js tests/verification-flake-handling.test.js`
Expected: PASS, including the three new #3481 tests and the unchanged AC3 test `preExisting: a failing file fully covered by the declared allowlist is adjudicated as passing…`.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/verify.js plugin/skills/test/verification.md tests/bin-lib/verify/cli.test.js
git commit -m "Refuse preExisting adjudication on unattributed failures — same accounting guard as flaky retry

refs #3481"
```

---

## Self-review

- **Spec coverage:** Deliverable 1 → Step 3. Deliverable 2 → Step 1 (spec, TAP, summary). Deliverable 3 → Step 4. AC1 → AC1.1/AC1.2 tests. AC2 → AC2.1 test. AC3 → the existing #3129 covered-run test, kept green in Step 5.
- **Placeholders:** none.
- **Types:** the reason strings match `planRetry`'s exactly. The ineligible report shape is unchanged.
