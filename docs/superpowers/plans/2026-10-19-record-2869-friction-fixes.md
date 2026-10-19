# Record #2869 Friction Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three of the four friction points in record #2869: the undocumented `parseNumstat` step before `computeDiffFacts`, the circular-require warnings from the code-health scanners, and `log-decision.js --reversibility` rejecting a parenthetical qualifier.

**Architecture:** Three independent tasks touching disjoint files, one commit each. Task 1 changes prose only and adds a conformance test. Task 2 moves `candidates-dead-code.js`'s registry require to after its own `module.exports` assignment, and extends the existing fresh-process require-order test to every `candidates-*.js` module. Task 3 widens `log-decision.js`'s `--reversibility` validation to `tier (qualifier)` and passes the full string through to `formatEntry` unchanged.

**Tech Stack:** Node 18+ CommonJS, `node --test`, markdown skill files.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T061314-record-2869/work/2869-spec.md` (worktree copy)

**Scope keywords:** parseNumstat, computeDiffFacts, inside circular dependency, --reversibility

## Global Constraints

- Item 1 (the AC-forwarding sample writer) belongs to #3044. Do not fold a sample-file writer into this record.
- Do not fix item 3 by suppressing Node warnings. The undefined bindings are real.
- A bare tier (`high|med|low|n/a`) for `--reversibility` keeps working unchanged.
- Commit messages: `{Verb} {what} — {detail}`, write `refs #2869`, never `closes`/`fixes`.
- Never run `git stash`.

## Corrected premise (build-time probe, logged to decisions.md)

The spec says `candidates-security-hardening.js` and `candidates-experiment-cleanup.js` require `./candidates-dead-code` before `./focus-generators`. On base `b220a7be2` both already require `./focus-generators` first: #2908 fixed one and #3330 fixed the other, and each loads directly with 0 circular warnings. A fresh-process probe of every module in `plugin/bin/lib/code-health/` gives:

```
candidates-abstraction-police.js: 0
candidates-agent-trust-scope.js: 0
candidates-app-store-readiness.js: 0
candidates-dead-code.js: 12
candidates-experiment-cleanup.js: 0
candidates-prelaunch.js: 0
candidates-security-hardening.js: 0
candidates-test-hygiene.js: 0
focus-generators.js: 0
```

`candidates-dead-code.js` is the remaining offender. It requires `./focus-generators` at line 110, before its own `module.exports` (line 560). The registry then autoloads every sibling vertical, and each sibling receives dead-code's still-empty exports object. In that process `scanSecurityHardening` throws `listTrackedFiles is not a function`, which was verified on a scratch fixture. Deliverable 2 therefore targets `candidates-dead-code.js`, and AC2's "every other `candidates-*.js` module" clause is what requires the change.

## Review Focus

- A `--reversibility` qualifier whose text itself contains parentheses (`high (see (a))`) should be accepted and rendered verbatim, since the qualifier group is greedy to the final `)`. Task 3 adds this test.
- A malformed qualifier shape: `high(x)` with no space, `high ()` empty, or `high (x` unclosed. Each must still exit 2 and must never write a line. Task 3 adds the test.
- A new `candidates-*.js` vertical added later must be covered by the warning test without anyone editing the test. Task 2 discovers modules with `readdirSync`, never from a hard-coded list.
- Requiring `focus-generators.js` first (the registry-first path) must stay warning-free and keep `dead-code` registered after Task 2 moves the require. Task 2's test covers `focus-generators.js` in the same loop and asserts `FOCUS_GENERATORS['dead-code']` is a function in a fresh process.
- `claim-log.js`'s `isClaimLogEntry` must still recognize a claim line that carries a qualifier. Task 3 adds the test.

---

### Task 1: Name `parseNumstat` between `git diff --numstat` and `computeDiffFacts`

**Files:**
- Modify: `plugin/skills/build/dispatch.md:19` (the "Whole-branch review model" sentence: "compute the run's diff facts via `bin/lib/dispatch/ceremony-derive.js`'s `computeDiffFacts` over the branch's `git diff --numstat` output")
- Modify: `plugin/skills/wrap-up/ceremony-derivation.md:30-33` (step 1: "Compute this run's diff facts via … `computeDiffFacts` over `git diff --numstat` against the run's own merge-base")
- Test: `tests/diff-facts-parse-numstat-conformance.test.js` (create)

**Interfaces:**
- Consumes: `parseNumstat(raw: string) -> {path, additions, deletions}[]` exported from `plugin/bin/lib/blast-radius-cli.js`; `computeDiffFacts(files) -> {fileCount, testFiles, docsFiles, implFiles, totalLines, testOnly, docsOnly, lowSurface}` from `plugin/bin/lib/dispatch/ceremony-derive.js`.
- Produces: nothing code-facing.

Byte headroom: `dispatch.md` is 23,640 B and `ceremony-derivation.md` is 3,864 B, both far under the shared 51,200 B ceiling. A grep of `tests/` found no file-specific byte pin and no content pin on the edited phrases.

- [ ] **Step 1: Write the failing test** `tests/diff-facts-parse-numstat-conformance.test.js`, with one shared assertion function used by both positive tests and by the negative control (go-red control rule):

```js
// assertNamesParser(text, label): the paragraph containing `computeDiffFacts`
// also contains `parseNumstat` and `blast-radius-cli.js`.
test('AC1.1: build/dispatch.md names parseNumstat before computeDiffFacts', ...)
test('AC1.1: wrap-up/ceremony-derivation.md names parseNumstat before computeDiffFacts', ...)
test('negative control: the assertion throws on a paragraph without parseNumstat', () => {
  assert.throws(() => assertNamesParser('… `computeDiffFacts` over `git diff --numstat` output …', 'control'));
});
test('the documented node -e composition runs and yields a diff-facts object', ...)
```

Paragraph = the blank-line-delimited block containing `computeDiffFacts`. Also assert that `parseNumstat` appears before `computeDiffFacts` in that block, at a smaller `indexOf`. The last test extracts the fenced or inline `node -e` snippet that ceremony-derivation.md adds in Step 3 (the first line in the file that contains both `parseNumstat` and `node -e`). It replaces `${CLAUDE_PLUGIN_ROOT}` with the absolute `plugin/` path, runs the snippet via `spawnSync('sh', ['-c', cmd], { input: '3\t1\tsrc/a.js\n' })` with stdin standing in for `git diff --numstat` (strip any leading `git diff … |` segment before running), then asserts that stdout parses as JSON with `fileCount === 1` and `implFiles === 1`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/diff-facts-parse-numstat-conformance.test.js`
Expected: FAIL (neither file mentions `parseNumstat`)

- [ ] **Step 3: Edit the two sentences.**
  - `dispatch.md:19`: replace "over the branch's `git diff --numstat` output" with "over the branch's `git diff --numstat` output, parsed first with `bin/lib/blast-radius-cli.js`'s `parseNumstat` (`computeDiffFacts` takes the parsed `{path, additions, deletions}[]` array, never the raw string; the runnable composition is in `wrap-up/ceremony-derivation.md` step 1)". Change nothing else in that line.
  - `ceremony-derivation.md` step 1: state that the numstat output is parsed with `parseNumstat` (`bin/lib/blast-radius-cli.js`) before `computeDiffFacts` is called, and add this one-line runnable composition, verified once on this branch (output `{"fileCount":2,…,"lowSurface":true}`):

```bash
git diff --numstat "$(git merge-base HEAD origin/main)" | node -e "const { parseNumstat } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/blast-radius-cli.js'); const { computeDiffFacts } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/dispatch/ceremony-derive.js'); console.log(JSON.stringify(computeDiffFacts(parseNumstat(require('fs').readFileSync(0, 'utf8')))))"
```

(Substitute the run's actual integration branch for `origin/main` in prose if the surrounding text already names `{integration-branch}`; keep the command itself a single line.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/diff-facts-parse-numstat-conformance.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/build/dispatch.md plugin/skills/wrap-up/ceremony-derivation.md tests/diff-facts-parse-numstat-conformance.test.js
git commit -m "Name parseNumstat before computeDiffFacts — refs #2869"
```

### Task 2: Remove the circular-require warning from `candidates-dead-code.js` and pin every module

**Files:**
- Modify: `plugin/bin/lib/code-health/candidates-dead-code.js:110` (remove the top-level `const { registerGenerator } = require('./focus-generators');`) and `:555-574` (register after `module.exports`)
- Modify: `tests/bin-lib/code-health/candidates-require-order.test.js` (add an all-modules test, update the header comment that says it is "Scoped to this one generator")
- Modify: `.claude/skills/code-health-focus-vertical/SKILL.md:53` (pitfall 1: one sentence on the registry's first-autoloaded module and a pointer to the all-modules test)

**Interfaces:**
- Consumes: `registerGenerator(name, fn)` and `FOCUS_GENERATORS` from `plugin/bin/lib/code-health/focus-generators.js` (unchanged).
- Produces: `candidates-dead-code.js` exports unchanged (same 13 names). `FOCUS_GENERATORS['dead-code'] === scanDeadCode` under both load orders.

- [ ] **Step 1: Write the failing test** in `candidates-require-order.test.js`:

```js
// Discover with fs.readdirSync(CODE_HEALTH_DIR), filtered to /^candidates-.*\.js$/ plus 'focus-generators.js'.
test('AC2.1/AC2.2: every candidates-*.js module and focus-generators.js loads in a fresh process with no circular-dependency warning', () => {
  // assert the discovered list includes 'candidates-dead-code.js' and has length >= 9
  // for each: spawnSync(process.execPath, ['-e', `require(${JSON.stringify(p)})`]);
  // collect every file whose stderr matches /inside circular dependency/i; assert.deepEqual(offenders, [])
});
test('dead-code stays registered under both load orders', () => {
  // fresh process A: require candidates-dead-code.js, then focus-generators.js; print typeof FOCUS_GENERATORS['dead-code']
  // fresh process B: require focus-generators.js only; same print
  // assert both stdout === 'function'
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/code-health/candidates-require-order.test.js`
Expected: FAIL after Step 1, with offenders `['candidates-dead-code.js']`

- [ ] **Step 3: Move dead-code's registry require below `module.exports`.** Delete the line-110 require. After the `module.exports = { … }` block, add `require('./focus-generators').registerGenerator('dead-code', scanDeadCode);`, replacing the old pre-exports `registerGenerator('dead-code', scanDeadCode);` call at line 558. Rewrite the comment above it to say why: this module is the registry's first autoload, so it must publish its exports before it triggers the registry's sibling cascade, because the siblings destructure its helpers at require time. Do not touch any other module. Update the test header comment and the SKILL.md pitfall 1 sentence to match.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/code-health/candidates-require-order.test.js tests/bin-lib/code-health/candidates-dead-code.test.js tests/bin-lib/code-health/focus-generators.test.js tests/bin-lib/code-health/candidates-security-hardening.test.js`
Expected: PASS, 0 failures

Then run the spec's literal AC2.1 probe: `node -e "require('./plugin/bin/lib/code-health/candidates-dead-code.js')" 2>&1 | grep -c "circular dependency"`
Expected: `0`

- [ ] **Step 5: Prove the test can go red.** Temporarily restore the top-level require with `git show HEAD:plugin/bin/lib/code-health/candidates-dead-code.js > plugin/bin/lib/code-health/candidates-dead-code.js`, re-run the require-order test and confirm it FAILS, then restore the fixed file from the working edit. Use a WIP commit before this step, never a stash.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/code-health/candidates-dead-code.js tests/bin-lib/code-health/candidates-require-order.test.js .claude/skills/code-health-focus-vertical/SKILL.md
git commit -m "Publish dead-code exports before loading the focus registry — refs #2869"
```

### Task 3: Accept a parenthetical qualifier on `log-decision.js --reversibility`

**Files:**
- Modify: `plugin/bin/log-decision.js:4-51` (header usage comment line 4, `USAGE` line 13, `REVERSIBILITY` line 14, validation line 51)
- Test: `tests/bin-lib/log-decision/cli.test.js`
- Test: `tests/bin-lib/log-decision/claim-log.test.js`
- No change expected: `plugin/bin/lib/log-decision/append.js` (`formatEntry` already renders `Reversibility: ${reversibility}.` verbatim) and `plugin/bin/lib/log-decision/claim-log.js` (`ACTION_RE`'s `Reversibility: [^.\s][^.]*\.$` already admits a dot-free qualifier). Each "no change" claim is proven by a test below.

**Interfaces:**
- Consumes: `run(argv, deps)` from `plugin/bin/log-decision.js`; `formatEntry`, `isClaimLogEntry`, `claimLogText` (existing).
- Produces: `--reversibility` accepts `^(high|med|low|n/a)(\s+\(.+\))?$`, validates group 1 against `REVERSIBILITY`, and passes the full string to `formatEntry`.

- [ ] **Step 1: Write the failing tests** in `cli.test.js`, reusing the file's `fixture()`/`deps()` helpers:

```js
test('AC3.1: --reversibility "high (branch can be reset/force-pushed)" exits 0 and writes the qualifier verbatim', () => {
  // run([... '--status','AUTO','--text','pushed x to origin','--reversibility','high (branch can be reset/force-pushed)'])
  // assert code 0; decisions.md === '- AUTO 09:05:07 — log-decision: pushed x to origin. Reversibility: high (branch can be reset/force-pushed).\n'
});
test('AC3.2: --reversibility "bogus (x)" exits 2 and writes nothing', ...)
test('AC3.3: malformed qualifier shapes exit 2: "high(x)", "high ()", "high (x", "high (x) trailing"', ...) // decisions.md never created
test('nested parentheses in the qualifier render verbatim: "low (see (a))"', ...)
test('bare tiers still accepted unchanged', ...) // each of high|med|low|n/a → line ends `Reversibility: {tier}.`
```

In `claim-log.test.js`:

```js
test('isClaimLogEntry accepts a claim line whose Reversibility carries a qualifier', () => {
  // line = formatEntry({ status:'AUTO', now, step:'Step 2.8', text: claimLogText(2869,'git'), reversibility:'high (claim can be released)' })
  // assert.equal(isClaimLogEntry(line), true)
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/log-decision/cli.test.js`
Expected: FAIL after Step 1 (the AC3.1 test and the nested-parens test exit 2 with "--reversibility must be one of high|med|low|n/a")

- [ ] **Step 3: Implement the validation in `log-decision.js`.** Add `const REVERSIBILITY_RE = /^(high|med|low|n\/a)(\s+\(.+\))?$/;`. In `run`, replace the `REVERSIBILITY.includes(o.reversibility)` check with a match against `REVERSIBILITY_RE` plus `REVERSIBILITY.includes(m[1])`. The error message becomes `--reversibility must be one of high|med|low|n/a, optionally followed by " (qualifier)"`. Update `USAGE` and the header comment to `[--reversibility high|med|low|n/a[" (qualifier)"]]`. Pass `o.reversibility` unchanged to `formatEntry`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/log-decision/cli.test.js tests/bin-lib/log-decision/claim-log.test.js tests/bin-lib/log-decision/append.test.js`
Expected: PASS, 0 failures. If a test pins the exact old USAGE or error string, update it in this task: grep `tests/` for `must be one of high|med|low|n/a` and for `--reversibility high|med|low|n/a]` first.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/log-decision.js tests/bin-lib/log-decision/cli.test.js tests/bin-lib/log-decision/claim-log.test.js
git commit -m "Accept a parenthetical qualifier on log-decision --reversibility — refs #2869"
```

### Task 4: Full verification (no new code)

Folded into /build Common Step 5. Runner checks only.

- [ ] **Step 1:** `npm test > {scratch}/npm-test.txt 2>&1; echo exit=$?`. Expected: `exit=0`. This covers AC4.1.

## Spec coverage map

| AC clause | Covered by |
|---|---|
| AC1.1 | Task 1 tests |
| AC2.1 | Task 2 all-modules test + literal probe |
| AC2.2 | Task 2 all-modules test |
| AC3.1 | Task 3 AC3.1 test |
| AC3.2 | Task 3 AC3.2 test |
| AC3.3 | Task 3 tests (both cases covered: qualifier accepted, bogus rejected) |
| AC4.1 | Task 4 |
