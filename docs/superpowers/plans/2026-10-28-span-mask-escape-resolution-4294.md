# Span-Mask Escape Resolution (#4294) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The write gate's glued-redirect scan resolves `echo $M\ >x`-shaped redirects (a `$`/`${ }`/backtick word, then an escaped blank, then `>`), and the record's escaped-blank and line-continuation cases are pinned as named regression tests.

**Architecture:** #4281 (`1961010a1`) already turned `tokenize`'s tokens into bash word values (escaped blanks unescaped, backslash-newlines deleted, `spanKinds` kept aligned) and `isUnresolvable` no longer rejects backslashes, so the record's classes 1 and 2 already resolve at base `fbffbd0e3` — Task 1 only pins them. The one code change is in `gluedRedirectOpEnd` (`plugin/bin/lib/hooks/git-command.js:1311`): a new helper accepts a prefix whose last escaped blank follows only closed expansions, holding the text after that blank to the existing plain-word rule. `bash-prefilter.js`'s `hasFileRedirection` reuses `redirectRawTargets`, so the prefilter follows with no edit of its own.

**Tech Stack:** Node 18+, `node --test`, no dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-10-28T114751-record-4294/work/4294-spec.md` (record #4294)

Scope keywords: gluedRedirectOpEnd, BALANCED_GROUP_RE, redirectRawTargets

Scope sweep (Check B hits, classified no-change): `plugin/bin/lib/hooks/bash-prefilter.js` calls `redirectRawTargets` unchanged and follows the parser automatically (pinned by Task 2's prefilter test); `docs/hooks.md`'s Bash-prefilter bullet describes that reuse, not the glued-word rule, so it stays accurate.

Waived tests/hooks-git-command.test.js: the spec's Key Files lists it as a possible home for the pins; every new pin lives in `tests/hooks-gate-coverage.test.js` beside the #4015/#4210 glued-redirect tests, and Task 2 Step 4 runs `tests/hooks-git-command.test.js` unchanged.

## Global Constraints

- Premise reversals (logged to the run's `decisions.md`): classes 1 and 2 are already resolved by #4281; the AC carry-over pair `cd \'/wt\' && git commit` and `echo x > \'/abs/f\'` resolve bash's actual relative target (`/r/'/wt'`, `/r/'/abs/f'`), as #4281's escaped-quote pins in `tests/hooks-git-command.test.js:801-807` require — do not change them to "none".
- `echo $M>x` stays `[]` — the record says it "must not change"; #4328's "Read a glued redirect after a word whose bare `$` part is a plain parameter reference" deliverable owns it. Equally, `$N>x` after the last escaped blank (`echo $M\ $N>x`) stays `[]`.
- Every expected target in a test comment carries a bash 3.2 and bash 5 verdict, recorded below in "Bash verdicts"; expected paths go through `path.resolve` (`path.resolve('/r', file)`), never a bare POSIX string.
- Test titles name the record and the behavior (`#4294: …`) and cite AC clause ids (`AC1.1`, …), never review-round labels.
- Commits: `{Verb} {what} — {detail}` style, ending `refs #4294` — never `closes`/`fixes`.
- `plugin/skills/_shared/policy-schema-coverage.md` is 36,737 B against the 52,500 B rail (`RAIL_BYTES`); the Task 2 edit adds well under 1 KB. Do not touch the four `proseList` anchor phrases in its heredoc paragraph (`tests/hooks-gate-coverage.test.js:160-165`).
- Governing project skill `.claude/skills/shell-scanner-bash-differential/SKILL.md` — its applicable rules, verbatim:
  - "Run every case you add or change under `/bin/bash` (3.2, macOS) and a bash 5 (`/opt/homebrew/bin/bash` here)." … "Write the verdict into the test comment, the way `tests/hooks-gate-coverage.test.js` does (\"bash 3.2 and 5 write /main/f.js for each\"). When the versions disagree, note it … and side with whichever shell writes. Never derive an expected target from the scanner's own output or from memory of the bash manual."
  - "The gate's tradeoff is that a spurious deny is acceptable and a leak is not." … "Pin each fail-closed tradeoff as deliberate, so a later \"fix\" cannot quietly reopen it."
  - "Every new rule can regress a shape that already worked. Run the full case list through `git-command.js` at the merge-base … Diff the targets. Anything that moves from denied to allowed needs its own bash verdict."
  - "In a scratch worktree, delete or invert each rule one at a time and run the four suites. A mutant that every test survives means one of two things: a pin is missing (add a case that fails on the mutant), or the rule is dead (remove it)."
  - "A new guarded program word or parser needs its own line in the differential corpus in `tests/hooks-bash-prefilter.test.js`."
  - "Test titles name the record and the behavior (`#4149: …`), never review-round labels (m1, F2, round N)."
  - "Expected paths the scanner resolves go through `path.resolve` (`MAIN_F` in `tests/hooks-gate-coverage.test.js`), or the pin fails on win32."

## Bash verdicts (recorded 2026-10-28, bounded runner, `/bin/bash` 3.2, `/opt/homebrew/bin/bash` 5, `/bin/zsh`)

Cwd `/r`, `M`/`N` unset unless assigned, `d` a stub command. "x" = the file `x` created in the cwd.

| Command | bash 3.2 | bash 5 | zsh |
|---|---|---|---|
| `echo $M\ >x`, `echo ${M}\ >x`, ``echo `d`\ >x``, `echo $M\ bar>x`, `M=a; echo $M\ >x`, `echo $1\ >x`, `echo $M\<TAB>>x`, `echo $M\ $N\ >x`, `echo ${M}a\ b>x`, `echo ${M:-${N}}\ >x` | x | x | x |
| `echo $M>x`, `echo $M\ $N>x` | x | x | x |
| `echo ${M\ >x}` | none (bad substitution) | none | none |
| `echo a(b)\ >x`, `echo $M\ (a)>x` | none (syntax error) | none | none |
| ``echo `d\ >x`` (unterminated backtick), `echo $M\ "a>x` (unterminated quote) | none (EOF error) | none | none |
| `echo a\"b>c` | c | c | c |
| `echo "a\" b>c "` | none | none | none |

Classes 1 and 2 (`mkdir a\ b` → `/r/a b`, `mkdir -p /r/a\ b/c`, `cp a my\ file.js` → `/r/my file.js`, `cd /r/a\ b && git commit` → `/r/a b`, `echo x >/ma\<newline>in/x` → `/main/x`, `mkdir -p \<newline>/abs/dir` → `/abs/dir`) are the record's own bash-measured targets; Task 1 re-confirms the two `cp`/`mkdir` relative ones with the runner before pinning.

## Review Focus

- A `${` the escaped blank sits inside (`echo ${M\ >x}`): must stay `[]` — bash writes nothing. Pinned in Task 2.
- An unterminated backtick or quote around the escaped blank: must stay `[]` (bash EOF error). Pinned in Task 2.
- A `$NAME` after the last escaped blank (`echo $M\ $N>x`): stays `[]`, the same as `$N>x` alone (#4328). Pinned in Task 2 as deliberate.
- A `>` inside `"$( … )"` before or after the escaped blank: `isNested` (unchanged) must still reject it. Pinned in Task 2 with `echo "$(a $M\ >x)"` → `[]`.
- The prefilter must take the full-handler path for the new shape, or the parser never runs. Pinned in Task 2 (corpus line + `hasFileRedirection`).

---

### Task 1: Pin the record's escaped-blank, line-continuation and carry-over cases

**Role:** transcription

**Files:**
- Test: `tests/hooks-gate-coverage.test.js` (append after the `#4210 F3` tests, ~line 990)

**Interfaces:**
- Consumes: `fileWriteTargets(command, cwd)`, `mkdirTargets(command, cwd)`, `gitTargets(command, cwd)` (already imported at the file's top).
- Produces: nothing later tasks call.

- [ ] **Step 1: Write the tests**

```js
// #4294 classes 1 and 2: an escaped blank in a path word and a backslash-newline continuation are
// bash word values since #4281, so each resolves the target bash writes (the record's measurements).
test('AC1.1 #4294: an escaped blank or a line continuation in a path word resolves bash\'s target', () => {
  const at = (action, f) => [{ action, file: path.resolve(f) }];
  assert.deepStrictEqual(mkdirTargets('mkdir a\\ b', '/r'), at('mkdir', '/r/a b'));
  assert.deepStrictEqual(mkdirTargets('mkdir -p /r/a\\ b/c', '/r'), at('mkdir', '/r/a b/c'));
  assert.deepStrictEqual(fileWriteTargets('cp a my\\ file.js', '/r'), at('copy', '/r/my file.js'));
  assert.deepStrictEqual(gitTargets('cd /r/a\\ b && git commit -m x', '/r'), [{ action: 'commit', dir: path.resolve('/r/a b') }]);
  assert.deepStrictEqual(fileWriteTargets('echo x >/ma\\\nin/x', '/r'), at('write', '/main/x'));
  assert.deepStrictEqual(mkdirTargets('mkdir -p \\\n/abs/dir', '/r'), at('mkdir', '/abs/dir'));
});

// #4294 AC2: #4212's carried-over expectations on the span-mask tokenizer. bash 3.2 and 5 write c for
// `echo a\"b>c` and nothing for `echo "a\" b>c "`; `echo foo\\>x` writes x and `echo foo\>x` nothing.
test('AC2.1 #4294: #4212\'s carried-over redirect expectations hold', () => {
  const at = (f) => [{ action: 'write', file: path.resolve('/r', f) }];
  assert.deepStrictEqual(fileWriteTargets('echo "a\\" b>c "', '/r'), []);
  assert.deepStrictEqual(fileWriteTargets('echo foo>x', '/r'), at('x'));
  assert.deepStrictEqual(fileWriteTargets('echo foo\\\\>x', '/r'), at('x'));
  assert.deepStrictEqual(fileWriteTargets('echo foo\\>x', '/r'), []);
  assert.deepStrictEqual(fileWriteTargets('echo $M>x', '/r'), []); // #4328 owns this shape
  assert.deepStrictEqual(fileWriteTargets('echo a\\"b>c', '/r'), at('c'));
  // Premise reversed (#4281): an escaped quote is a literal path character, so bash's target is relative.
  assert.deepStrictEqual(gitTargets("cd \\'/wt\\' && git commit -m x", '/r'), [{ action: 'commit', dir: path.resolve('/r', "'/wt'") }]);
  assert.deepStrictEqual(fileWriteTargets("echo x > \\'/abs/f\\'", '/r'), at("'/abs/f'"));
});

// #4294 AC3: #4210's cases still resolve. bash 3.2 and 5 write x and out.
test('AC3.1 #4294: #4210\'s quoted-span and one-word-group redirects still resolve', () => {
  assert.deepStrictEqual(fileWriteTargets('echo "hi">x', '/r'), [{ action: 'write', file: path.resolve('/r', 'x') }]);
  assert.deepStrictEqual(fileWriteTargets('(ls)>out', '/r'), [{ action: 'write', file: path.resolve('/r', 'out') }]);
});
```

- [ ] **Step 2: Run them — they pass at base (characterization of #4281's behavior)**

Run: `node --test --test-name-pattern="#4294" tests/hooks-gate-coverage.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 3: Prove the class 1/2 pins discriminate (scratch mutant, never committed)**

In `plugin/bin/lib/hooks/git-command.js`'s `tokenize`, temporarily delete the line `if (c === '\\' && next === '\n') { j += 1; continue; }` and re-run Step 2's command: Expected FAIL (the two continuation pins). Restore it. Then temporarily change `(isBare || '$`"\\'.includes(next))` to `('$`"\\'.includes(next))`: Expected FAIL (the four escaped-blank pins). Restore it, confirm `git diff --stat plugin/` is empty.

- [ ] **Step 4: Commit**

```bash
git add tests/hooks-gate-coverage.test.js
git commit -m "Pin the escaped-blank, continuation and carry-over redirect cases — refs #4294"
```

### Task 2: Resolve a glued redirect after an escaped blank that follows closed expansions

**Role:** judgment
**Review risk:** high

**Files:**
- Modify: `plugin/bin/lib/hooks/git-command.js:1293-1327` (`gluedRedirectOpEnd` and its comment block)
- Test: `tests/hooks-gate-coverage.test.js` (append after Task 1's tests)
- Test: `tests/hooks-bash-prefilter.test.js:27-50` (corpus line) and a new `#4294` test after line 187
- Modify: `plugin/skills/_shared/policy-schema-coverage.md:28` (the "Bare shell redirection is covered (#3080)." paragraph)
- Modify: `docs/journeys/write-a-glued-redirect-from-the-main-checkout-4015.md` (step 2's "Should understand", step 3's gap list, an Origin line)

**Interfaces:**
- Consumes: `gluedRedirectOpEnd(raw, kinds, nest)` — `raw` the pre-substitution token, `kinds` its `spanKinds` string (`b`/`e`/`s`/`d`/`x`), `k` the index of the first bare `>`.
- Produces: `escapedBlankPrefixOk(raw: string, kinds: string, k: number): boolean` — module-private, not exported.

- [ ] **Step 1: Write the failing tests** (gate coverage; bash verdicts from the table above in each comment)

```js
// #4294 class 3: an escaped blank ends a `$NAME`, `${ … }` or backtick word part, so a glued `>`
// after it is a redirect. bash 3.2 and 5 (and zsh) write x for each.
test('AC1.1 #4294: a glued redirect after closed expansions and an escaped blank resolves its target', () => {
  for (const command of [
    'echo $M\\ >x', 'echo ${M}\\ >x', 'echo `d`\\ >x', 'echo $M\\ bar>x', 'M=a; echo $M\\ >x', 'echo $1\\ >x',
    'echo $M\\\t>x', 'echo $M\\ $N\\ >x', 'echo ${M}a\\ b>x', 'echo ${M:-${N}}\\ >x',
  ]) {
    assert.deepStrictEqual(fileWriteTargets(command, '/r'), [{ action: 'write', file: path.resolve('/r', 'x') }], JSON.stringify(command));
  }
});

// Each line is decided by one guard of the rule. bash 3.2 and 5 write nothing for the first five (bad
// substitution, a syntax error, or an unterminated backtick or quote). The last two are deliberate
// fail-open pins: bash writes x, but a `$` after the last escaped blank is #4328's shape, and a `>`
// inside "$( … )" stays nested.
test('AC1.1 #4294: an escaped blank inside an open expansion, or before a bare `$`, resolves no target', () => {
  for (const command of [
    'echo ${M\\ >x}', 'echo a(b)\\ >x', 'echo $M\\ (a)>x', 'echo `d\\ >x', 'echo $M\\ "a>x',
    'echo $M\\ $N>x', 'echo "$(a $M\\ >x)"',
  ]) {
    assert.deepStrictEqual(fileWriteTargets(command, '/r'), [], JSON.stringify(command));
  }
});
```

Prefilter (`tests/hooks-bash-prefilter.test.js`): add `'echo $M\\ >tracked.js',` to `DIFFERENTIAL_CORPUS` under a `// #4294: a glued redirect after a $NAME word and an escaped blank.` comment, and:

```js
test('AC1.1 #4294: the differential corpus lists the escaped-blank shape, and it takes the full-handler path', () => {
  assert.ok(DIFFERENTIAL_CORPUS.includes('echo $M\\ >tracked.js'));
  assert.strictEqual(shouldRunFull('pre-tool-use', bash('echo $M\\ >tracked.js')), true);
  assert.strictEqual(hasFileRedirection('echo $M>tracked.js'), false);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test --test-name-pattern="#4294" tests/hooks-gate-coverage.test.js tests/hooks-bash-prefilter.test.js`
Expected: FAIL after Step 1 — the "resolves its target" test and the new prefilter test fail (verified on a scratch base copy while authoring: base resolves `[]` for all ten positive commands and `shouldRunFull` is false); the "resolves no target" test already passes at base.

- [ ] **Step 3: Implement `escapedBlankPrefixOk(raw, kinds, k)` and call it from `gluedRedirectOpEnd`**

In `gluedRedirectOpEnd`, the rejection becomes: return null when `!plain` and neither the `BALANCED_GROUP_RE` exception nor `escapedBlankPrefixOk(raw, kinds, k)` holds. The helper:

```js
// #4294: a prefix whose LAST escaped blank (`\ ` or an escaped tab, kind `e`) follows only closed
// expansions. Before that blank: no bare `(`, no stray (`x`) character, every bare `${` closed by a
// bare `}` (counted, so `${M:-${N}}` closes) and every bare backtick paired. After it: the plain-word
// rule above (no stray, no bare `$`, backtick or `(`), so `$M\ $N>x` stays out as `$N>x` does (#4328).
function escapedBlankPrefixOk(raw, kinds, k) {
  let blank = -1;
  for (let j = 0; j < k; j += 1) if (kinds[j] === 'e' && (raw[j] === ' ' || raw[j] === '\t')) blank = j;
  // No blank (-1): the after-part is the whole prefix, which the caller already found not plain.
  for (let j = blank + 1; j < k; j += 1) {
    if (kinds[j] === 'x' || (kinds[j] === 'b' && '$`('.includes(raw[j]))) return false;
  }
  let braces = 0;
  let tick = false;
  for (let j = 0; j < blank; j += 1) {
    if (kinds[j] === 'x') return false;
    if (kinds[j] !== 'b') continue;
    const c = raw[j];
    if (c === '(') return false;
    if (c === '`') tick = !tick;
    else if (c === '$' && raw[j + 1] === '{' && kinds[j + 1] === 'b') { braces += 1; j += 1; }
    else if (c === '}' && braces > 0) braces -= 1;
  }
  return braces === 0 && !tick;
}
```

Extend `gluedRedirectOpEnd`'s comment block with one sentence naming the second exception and `#4294`.

- [ ] **Step 4: Run them to verify they pass, then the four scanner suites**

Run: `node --test --test-name-pattern="#4294" tests/hooks-gate-coverage.test.js tests/hooks-bash-prefilter.test.js` — Expected: PASS.
Run: `node --test tests/hooks-gate-coverage.test.js tests/hooks-git-command.test.js tests/hooks-bash-prefilter.test.js tests/teardown-gate.test.js` — Expected: PASS, 0 failures (AC3.1: the existing suites pass unchanged).

- [ ] **Step 5: Mutant proof (scratch, never committed) — one at a time, re-run Step 4's first command, expect FAIL, restore**

1. Start the after-part loop at `blank + 2` instead of `blank + 1` (skips the first character after the blank): expect `echo $M\ $N>x` red.
2. Drop `kinds[j] === 'x' ||` in the after-part loop: expect `echo $M\ "a>x` red.
3. Drop `'$'` from the after-part `'$`('` set: expect `echo $M\ $N>x` red.
4. Drop the `(` return in the before-part: expect `echo a(b)\ >x` red.
5. Make the `${` branch a no-op: expect `echo ${M\ >x}` red.
6. Make the backtick toggle a no-op: expect ``echo `d\ >x`` red.
7. Replace `braces === 0 && !tick` with `true`: expect `echo ${M\ >x}` and ``echo `d\ >x`` red.
Any mutant that every test survives: add the discriminating case, or delete the rule as dead.

- [ ] **Step 6: Base comparison (scratch)**

`git worktree add --detach {scratchpad}/base4294 fbffbd0e3` (its own Bash call), then a scratchpad node script that `require`s both copies' `git-command.js` and diffs `fileWriteTargets(cmd, '/r')` over every command in `tests/hooks-gate-coverage.test.js`'s redirect tests (lines 632-990) plus this task's lists. Expected: the only differences are this task's ten positive commands, moving from `[]` to `x`. Remove the scratch worktree with `git worktree remove {scratchpad}/base4294` afterwards.

- [ ] **Step 7: Update the prose**

`policy-schema-coverage.md` line 28, after "…`diff <(a) <(b)>out`)." add: "A second exception is an escaped blank (`\ ` or an escaped tab) after which the rest of the word is held to that same rule, when everything before it is closed: no bare `(`, every `${ … }` and backtick pair closed, so `echo $M\ >x`, `echo ${M}\ bar>x` and ``echo `d`\ >x`` resolve `x` while `echo ${M\ >x}` and `echo $M\ $N>x` do not (#4294); `echo $M>x` resolves no target either, a tracked gap (#4328). A word is read as its bash value, so an escaped blank (`> my\ file`) and a backslash-newline (`>/ma\`+newline+`in/x`) inside a target join as bash joins them (#4281)."

Journey: in step 2's "Should understand", after "(`echo foo\ bar>x`)." add "So is a `$NAME`, `${ … }` or backtick part closed before an escaped blank (`echo $M\ >x`, #4294); the text after that blank follows the same rule, so `echo $M>x` and `echo $M\ $N>x` stay without a target (#4328)." In step 3's gap list add "a glued `>` after a bare `$NAME` (`echo $M>x`, #4328)". Append to Origin: "- Updated during build of #4294. An escaped blank after closed expansions (`echo $M\ >x`) now resolves its glued redirect; the escaped-blank and line-continuation path words the record named were already bash values since #4281 and are pinned by name."

Run: `node --test tests/hooks-gate-coverage.test.js` — Expected: PASS (the prose-list anchors are untouched).

- [ ] **Step 8: Commit**

```bash
git add plugin/bin/lib/hooks/git-command.js tests/hooks-gate-coverage.test.js tests/hooks-bash-prefilter.test.js plugin/skills/_shared/policy-schema-coverage.md docs/journeys/write-a-glued-redirect-from-the-main-checkout-4015.md
git commit -m "Resolve a glued redirect after closed expansions and an escaped blank — refs #4294"
```

## Spec coverage

| Spec item | Where |
|---|---|
| Deliverable 1 (tokenize unescapes, deletes backslash-newline, mask aligned, other pairs verbatim) | Already shipped by #4281 (premise reversed); pinned by Task 1 Step 1 and its Step 3 mutants |
| Deliverable 2 (glued scan after `$`/backtick + escaped blank, not `$M>x`) | Task 2 |
| Deliverable 3 (`isUnresolvable` stops rejecting unescaped backslashes) | Already shipped by #4281 (`isUnresolvable` holds no backslash rule); covered by Task 1's class-1 pins |
| Deliverable 4 (journey + policy-schema-coverage prose) | Task 2 Step 7 |
| AC1.1 | Task 1 (classes 1, 2) and Task 2 (class 3) |
| AC2.1 | Task 1 second test (two escaped-quote items per the premise reversal) |
| AC3.1 | Task 1 third test; Task 2 Step 4's four-suite run |
| AC4.1 | Common Step 5 / `/claude-tweaks:test` full-suite run |
