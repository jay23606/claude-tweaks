# Escape-Aware Hook Tokenizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `tokenize` in `plugin/bin/lib/hooks/git-command.js` honours a backslash escape inside a double-quoted span and outside quotes, so `echo "a\" b>c "` no longer reads `b>c` as a bare redirect.

**Architecture:** Replace `tokenize`'s regex with an escape-aware one, and post-process each match's value so that only an escaped quote is unescaped. Every other backslash pair is kept verbatim. That keeps `isUnresolvable`'s backslash guard and every Windows-path token (`C:\Windows\...powershell.exe`, `C:\bin\sh`) byte-identical. No consumer changes. `gitTargets`, `fileWriteTargets`, `mkdirTargets`, `teardownTargets` (pre-tool-use.js), `powershellOpaqueCommand`, `bodyRunsAsShell` and bash-prefilter's `hasFileRedirection` all read `tokenize` through `forEachCommandSegment` or directly, and they keep their contracts.

**Tech Stack:** Node 18+, `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-10-25T080649-record-4212/work/4212-spec.md`

**Scope keywords:** tokenize

## Global Constraints

- `fileWriteTargets('echo "a\" b>c "', '/r')` returns no target; `fileWriteTargets('echo foo>x', '/r')` still returns `/r/x`.
- No change to the expected targets of any existing `gitTargets`, `mkdirTargets` or `teardownTargets` case; the full `npm test` passes.
- Ambiguity resolves to "no target" (this module's posture): never fabricate a target.

## Decisions (the implementer cannot make these alone)

1. **New regex**, same three capture groups, same order:
   `/"((?:[^"\\]|\\[\s\S])*)"|'([^']*)'|((?:\\[^\n]?|[^\s\\])+)/g`
   - Group 1, a double-quoted span: a backslash pairs with whatever character follows it, so `\"` never closes the span and `\\` is one pair. An unterminated span fails this alternative and falls through to the bare alternative, the same as before.
   - Group 2, a single-quoted span: unchanged (bash gives backslash no meaning there).
   - Group 3, a bare word: a backslash pairs with the next character unless that character is a newline. A space after a backslash therefore joins the word (`a\ b` is one token, value `a b` per Decision 2). A backslash before a newline (a line continuation), or at the end of the string, stays a lone `\`, as before. Keeping the newline excluded is load-bearing: pairing it would glue `mkdir -p \<newline>/abs` into one unresolvable token and lose a target the gate resolves today.
2. **Token values.** An escaped quote yields the unescaped character, matching bash. Every other pair stays verbatim:
   - group 1: `m[1].replace(/\\([\s\S])/g, (p, c) => (c === '"' ? c : p))`
   - group 3: `m[3].replace(/\\([\s\S])/g, (p, c) => (c === '"' || c === "'" || c === ' ' || c === '\t' ? c : p))` (an escaped blank also yields the blank, so a word that runs on through it cannot swallow a following redirect: `echo foo\ >x` is the token `foo >x`)
   - group 2: unchanged.
   The replace must consume pairs left to right, as written. A naive `/\\"/g` misreads `a\\"b` (an escaped backslash, then a literal quote).
3. The adjacent-span merge and the `singleQuoted`/`doubleQuoted` flags are unchanged.
4. Update the two stale comments. The `tokenize` header gains one paragraph stating decisions 1-2 and why non-quote escapes stay verbatim: Windows paths, and `isUnresolvable`'s backslash guard. The `isUnresolvable` comment (currently "the regex tokenizer below is not escape-aware") is reworded: a token still carrying a backslash (a verbatim non-quote escape) or a quote (an unescaped `\"`) cannot be trusted as a literal path.

## Review Focus

- Windows backslash paths (`C:\Windows\System32\powershell.exe -Command ...`, `C:\bin\sh <<EOF`) must keep their exact token values, or the powershell gate and the heredoc shell carve-out silently weaken. Pinned in Task 1 (`AC2.1 #4212: non-quote escapes stay verbatim`).
- A line continuation (`mkdir -p \` then a newline, then `/abs/dir`) must still resolve `/abs/dir`. Pinned in Task 1.
- `\\` before a closing quote (`"a\\"`) must still close the span, and its value stays `a\\`. Pinned in Task 1.
- A bare-word escaped quote followed by `>` (`echo a\"b>c`) must not newly fabricate a target: the unescaped `"` stays excluded by `GLUED_REDIRECT_RE`. Pinned in Task 1.
- A redirect after a span containing an escaped quote (`echo "a\"b" > out.js`) must still resolve `out.js`. This is the positive control showing the span really closed. Pinned in Task 1.

---

### Task 1: Escape-aware `tokenize`

**Files:**
- Modify: `plugin/bin/lib/hooks/git-command.js` (`tokenize` at ~line 94 and its header comment ~77-93; `isUnresolvable` comment ~124-134)
- Test: `tests/hooks-git-command.test.js`
- Test: `tests/hooks-gate-coverage.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `tokenize(seg: string) -> { tokens: string[], singleQuoted: boolean[], doubleQuoted: boolean[] }`. The signature is unchanged; only the values differ, as stated in Decisions 1-2. Consumers (all unchanged): `forEachCommandSegment`, `bodyRunsAsShell` (git-command.js); `teardownTargets` (pre-tool-use.js, via `forEachCommandSegment`); `hasFileRedirection` (bash-prefilter.js, via `forEachCommandSegment`).

- [ ] **Step 1: Write the failing tests**

In `tests/hooks-gate-coverage.test.js`, right after the `AC1.2 AC2.1 #4015` test (fileWriteTargets/path are already imported there):

```js
test('AC1.1 AC1.2 #4212: a backslash-escaped quote does not end a double-quoted span, so the text after it is not a redirect', () => {
  assert.deepStrictEqual(fileWriteTargets('echo "a\\" b>c "', '/r'), []);
  assert.deepStrictEqual(fileWriteTargets('echo foo>x', '/r'), [{ action: 'write', file: path.resolve('/r', 'x') }]);
});

test('#4212: a redirect after a span holding an escaped quote still resolves (the span really closed)', () => {
  assert.deepStrictEqual(fileWriteTargets('echo "a\\"b" > out.js', '/r'), [{ action: 'write', file: path.resolve('/r', 'out.js') }]);
});

test('#4212: a bare-word escaped quote glued to > fabricates no target', () => {
  assert.deepStrictEqual(fileWriteTargets('echo a\\"b>c', '/r'), []);
});
```

In `tests/hooks-git-command.test.js`, add `tokenize` to the existing `require('../plugin/bin/lib/hooks/git-command')` destructure, then append:

```js
test('#4212: an escaped quote inside a double-quoted span yields the quote and keeps the span whole', () => {
  assert.deepStrictEqual(tokenize('echo "a\\" b>c "'), { tokens: ['echo', 'a" b>c '], singleQuoted: [false, false], doubleQuoted: [false, true] });
});

test('#4212: a bare-word escaped quote yields the unescaped character', () => {
  assert.deepStrictEqual(tokenize('echo a\\"b it\\\'s').tokens, ['echo', 'a"b', "it's"]);
});

test('#4212: an escaped space outside quotes joins the word and yields the space, as bash does', () => {
  assert.deepStrictEqual(tokenize('mkdir a\\ b').tokens, ['mkdir', 'a b']);
  assert.deepStrictEqual(mkdirTargets('mkdir a\\ b', '/r'), [{ action: 'mkdir', file: path.resolve('/r', 'a b') }]);
});
// (Revised during build: the final whole-branch review found the original
// "stays unresolvable" form hid real targets — `echo foo\ >x` — so an escaped
// blank now yields the blank; the escaped-blank redirect pins live in
// tests/hooks-gate-coverage.test.js.)

test('AC2.1 #4212: non-quote escapes stay verbatim — Windows paths, a doubled backslash before a closing quote, a trailing backslash', () => {
  assert.strictEqual(tokenize('C:\\Windows\\System32\\powershell.exe -Command x').tokens[0], 'C:\\Windows\\System32\\powershell.exe');
  assert.deepStrictEqual(tokenize('git commit -m "a\\\\" b'), { tokens: ['git', 'commit', '-m', 'a\\\\', 'b'], singleQuoted: [false, false, false, false, false], doubleQuoted: [false, false, false, true, false] });
  assert.deepStrictEqual(tokenize('echo foo\\').tokens, ['echo', 'foo\\']);
});

test('AC2.1 #4212: a line continuation still resolves the next line\'s target', () => {
  assert.deepStrictEqual(mkdirTargets('mkdir -p \\\n/abs/dir', '/r'), [{ action: 'mkdir', file: path.resolve('/abs/dir') }]);
});
```

- [ ] **Step 2: Run the tests to verify the new escaped-quote cases fail**

Run: `node --test --test-name-pattern="4212" tests/hooks-gate-coverage.test.js tests/hooks-git-command.test.js`
Expected: FAIL. The `AC1.1 AC1.2 #4212` test gets `[{ action: 'write', file: '/r/c' }]`; the two `tokenize` escaped-quote tests and the escaped-space test fail too. The `AC2.1` stability pins and the bare-word `>` test already pass. That is expected: they pin values that must not move.

- [ ] **Step 3: Implement the regex and value post-processing in `tokenize` (Decisions 1-3), and update both comments (Decision 4)**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hooks-gate-coverage.test.js tests/hooks-git-command.test.js tests/teardown-gate.test.js tests/hooks-bash-prefilter.test.js tests/hooks-policy-exemption.test.js tests/hooks-dispatcher.test.js`
Expected: PASS, 0 failures. Every existing case is unchanged (AC2.1).

- [ ] **Step 5: Prove the AC test discriminates (AC1.2)**

Temporarily restore the old regex line (`const re = /"([^"]*)"|'([^']*)'|(\S+)/g;`, values taken unprocessed). Run `node --test --test-name-pattern="AC1.1 AC1.2 #4212" tests/hooks-gate-coverage.test.js` and confirm it FAILS. Then restore the new code and confirm it PASSES. Quote both outputs' `ℹ fail` lines in the report. Do not commit the reverted state.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/hooks/git-command.js tests/hooks-git-command.test.js tests/hooks-gate-coverage.test.js
git commit -m "Make the hook tokenizer escape-aware — a backslash-escaped quote no longer ends a quoted span (refs #4212)"
```

## Spec coverage map

| Spec item | Covered by |
|---|---|
| Deliverable 1 (escape handling + token value decision) | Task 1 Step 3, Decisions 1-2 |
| Deliverable 2 (check every parser; pin shapes in both test files) | Interfaces consumer list; Task 1 Step 1 (both files); Step 4 runs every suite importing git-command |
| AC1.1 | `AC1.1 AC1.2 #4212` test |
| AC1.2 | same test in `tests/hooks-gate-coverage.test.js`, Step 5 revert-to-red |
| AC2.1 | `AC2.1 #4212` pins, Step 4, and the full `npm test` in the build's final verification |
