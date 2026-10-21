# Path-relative containment migration (#3642) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five `rel.startsWith('..')` containment re-derivations under `plugin/bin` with the shared `isPathContained` helper, pin each behavior change, and make the conformance scan reject the idiom.

**Architecture:** `isPathContained(candidate, root, { orEqual })` (`plugin/bin/lib/shared-primitives.js:208`) is the strict/or-equal wrapper over path-guard's `isAncestorOrSelf`, which treats a child named `..foo` as contained. Each site keeps its own strictness (equality admitted or not) and only swaps the containment predicate; the `path.relative` value is still computed where the site needs it for something else (segment splitting). Characterization cases go in the existing `tests/bin-lib/path-guard/callers-characterization.test.js`, in a new `#3642` section.

**Tech Stack:** Node 18+, `node --test`, no external deps.

**Spec:** `.claude-tweaks/pipelines/2026-10-21T171235-record-3642/work/3642-spec.md`

Scope keywords: startsWith('..')

## Global Constraints

- Keep each site's strictness: hooks.js and visual-decide/server.js admit equality (`orEqual: true`); pre-tool-use.js, engine-verify.js and context-cost.js are strict (default).
- Every migrated site's existing suite passes **unmodified** (no edits to `tests/hooks-*.test.js`, `tests/bin-lib/visual-decide/server.test.js`, `tests/bin-lib/wrap-up/engine-verify.test.js`, `tests/bin-lib/skill-audit/context-cost.test.js`).
- Import `isPathContained` from `shared-primitives` (pre-tool-use.js already does, line 41); never re-derive with `path.relative` + string checks.
- Commit messages: `{Verb} {what} — {detail}`, ending `refs #3642` — never `closes`/`fixes`.
- Commit tests only where the task asks for them or the repo already keeps tests for this kind of change, sized like the neighboring test files; scratch checks stay scratch. Touch only what the task requires — a pre-existing bug you notice is a follow-up to report, not a fix to fold in, unless the task cannot work without it. Don't reformat or "improve" adjacent code; edit in place rather than rewrite when the result is the same.

## Review Focus

1. **Equality at each strict site** — a path equal to the root must stay rejected where it was rejected (pre-tool-use: the pipelines dir itself → `null`; context-cost: `${CLAUDE_PLUGIN_ROOT}/` → unparsed escape). Pinned in Tasks 1 and 2.
2. **Equality at each or-equal site** — `resolveSafe(root, '/')` returns root (existing server suite); hooks.js `inPipelines` true for the pipelines dir itself (unchanged, segment `''` is not run-id-shaped).
3. **Real `..` escapes stay rejected** — `../x`, `..` (existing suites at every site; not re-pinned).
4. **Symlinked temp roots (macOS `/var` → `/private/var`)** — pre-tool-use compares canonical paths; the Task 1 test asserts against the canonicalised pipelines dir, never the lexical one.
5. **win32 cross-drive** — `isAncestorOrSelf` returns false for an absolute `rel`; not reproducible on a POSIX host, covered by path-guard's own suite.

---

### Task 1: Migrate the two hook-layer pipelines-shape checks

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js:689-690` (`shadowPipelineRunDir`)
- Modify: `plugin/bin/hooks.js:36-49` (add require), `plugin/bin/hooks.js:262-264` (`pipelinesRunIdShape`)
- Test: `tests/bin-lib/path-guard/callers-characterization.test.js` (append a `#3642` section; update the file header comment's first paragraph to say #3642's cases each pin an intended behavior change and are red before migration)

**Interfaces:**
- Consumes: `isPathContained(candidate, root, { orEqual = false } = {}) -> boolean` from `plugin/bin/lib/shared-primitives.js`; `shadowPipelineRunDir(targetPath, { fsImpl }) -> null | { worktreeRoot, runDirCandidate }` (exported by pre-tool-use.js); `gitRepo()`, `linkedWorktreeOf(main)` from `tests/helpers/git-fixtures`; `canonicalRealpath` from `plugin/bin/lib/path-guard`.
- Produces: nothing new for later tasks.

**hooks.js has no observable behavior change:** `pipelinesRunIdShape`'s `inPipelines` flips to true for a leading `..foo` segment, but both callers (hooks.js:483 and :544) also require `runIdShaped`, and `RUN_ID_RE = /^\d{4}-\d{2}-\d{2}T/` (`plugin/bin/lib/hooks/run-dir-resolve.js:35`) can never match `..foo`. No characterization case for it — `Waived` for hooks.js only; its existing suites (`tests/hooks-run-arg-anchoring.test.js`, `tests/hooks-archive-run-1452.test.js`) must pass unmodified.

- [ ] **Step 1: Write the failing characterization tests** (append to callers-characterization.test.js)

```js
// ---- #3642: path.relative re-derivations migrated to isPathContained -------
const { gitRepo, linkedWorktreeOf } = require('../../helpers/git-fixtures');
const { canonicalRealpath } = require('../../../plugin/bin/lib/path-guard');
const { shadowPipelineRunDir } = require('../../../plugin/bin/lib/hooks/pre-tool-use');

test('#3642 AC2.1 pre-tool-use: a new run dir named ..foo inside a linked worktree is a shadow (was treated as outside pipelines/)', () => {
  const wt = linkedWorktreeOf(gitRepo());
  const out = shadowPipelineRunDir(path.join(wt, '.claude-tweaks', 'pipelines', '..foo', 'decisions.md'));
  assert.ok(out, 'expected a shadow verdict');
  assert.equal(out.runDirCandidate, path.join(canonicalRealpath(wt), '.claude-tweaks', 'pipelines', '..foo'));
});

test('#3642 pre-tool-use: the pipelines dir itself is still not a shadow (strictness kept)', () => {
  const wt = linkedWorktreeOf(gitRepo());
  assert.equal(shadowPipelineRunDir(path.join(wt, '.claude-tweaks', 'pipelines')), null);
});
```

Note: the `isPolicyFile` require above already destructures from pre-tool-use; add `shadowPipelineRunDir` as its own `const` line as shown rather than editing that earlier line.

- [ ] **Step 2: Run to verify the ..foo case fails**

Run: `node --test --test-name-pattern "3642" tests/bin-lib/path-guard/callers-characterization.test.js`
Expected: FAIL after Step 1 — `expected a shadow verdict` (the strictness test passes already).

- [ ] **Step 3: Migrate both sites**

- pre-tool-use.js: replace the line-690 condition with `if (!isPathContained(real, pipelinesDir)) return null;` — keep `relFromPipelines` (still split below).
- hooks.js: add `const { isPathContained } = require('./lib/shared-primitives');` beside the other top-level lib requires; in `pipelinesRunIdShape`, compute the pipelines dir once and set `inPipelines = isPathContained(resolved, pipelinesDir, { orEqual: true })`; keep `relFromPipelines` (returned and split).

- [ ] **Step 4: Run the new tests and both sites' existing suites**

Run: `node --test tests/bin-lib/path-guard/callers-characterization.test.js tests/hooks-pipeline-shadow-guard.test.js tests/hooks-run-arg-anchoring.test.js tests/hooks-archive-run-1452.test.js tests/hooks-dispatcher.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js plugin/bin/hooks.js tests/bin-lib/path-guard/callers-characterization.test.js
git commit -m "Route the hook-layer pipelines containment checks through isPathContained — a ..foo run dir is now inside pipelines/, refs #3642"
```

### Task 2: Migrate the visual-decide, engine-verify and context-cost checks

**Files:**
- Modify: `plugin/bin/lib/visual-decide/server.js:9-10` (require), `:34-49` (`resolveSafe` and its comment)
- Modify: `plugin/bin/lib/wrap-up/engine-verify.js:23-38` (require), `:335-340` (`isUnderArchiveRoot`)
- Modify: `plugin/bin/lib/skill-audit/context-cost.js:24` (extend the existing shared-primitives destructure), `:265-272` (`escapesRoot` and its comment)
- Test: `tests/bin-lib/path-guard/callers-characterization.test.js` (same `#3642` section)

**Interfaces:**
- Consumes: `isPathContained` (as Task 1); `resolveSafe(rootDir, urlPath) -> string | null` (server.js export); `runVerify({ runDir, originalRunDir, base, repoRoot, cwd, deps }) -> { rows: [{ check, result, detail }] }` (engine-verify export); `parseComposeCallLine(line, repoRoot) -> null | { step, sources } | { unparsed, reason }` (context-cost export).
- Produces: nothing new.

- [ ] **Step 1: Write the failing characterization tests** (append to the `#3642` section)

```js
const { resolveSafe } = require('../../../plugin/bin/lib/visual-decide/server');
const { runVerify } = require('../../../plugin/bin/lib/wrap-up/engine-verify');
const { parseComposeCallLine } = require('../../../plugin/bin/lib/skill-audit/context-cost');

test('#3642 AC2.1 visual-decide: resolveSafe serves a child directory named ..foo (was rejected as an escape)', () => {
  const root = fresh();
  assert.equal(resolveSafe(root, '/..foo/a.txt'), path.join(root, '..foo', 'a.txt'));
});

test('#3642 AC2.1 engine-verify: a run dir under archive/..foo is the archived copy (was read as the still-present original)', () => {
  const repoRoot = fresh();
  const archived = path.join(repoRoot, '.claude-tweaks', 'pipelines', 'archive', '..foo-run');
  fs.mkdirSync(archived, { recursive: true });
  const result = runVerify({ runDir: archived, originalRunDir: archived, base: 'main', repoRoot, cwd: fresh(), deps: { git: () => '', gh: () => '' } });
  assert.equal(result.rows.find((r) => r.check === 'run-dir-archived').result, 'pass');
});

const composeLine = (src) => `node "\${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run "$PIPELINE_RUN_DIR" --step merge "\${CLAUDE_PLUGIN_ROOT}/${src}"`;

test('#3642 AC2.1 context-cost: a source under a ..foo directory is contained (was an escapes-the-plugin-root row)', () => {
  assert.deepEqual(parseComposeCallLine(composeLine('..foo/a.md'), '/r/plugin').sources, [path.resolve('/r/plugin', '..foo/a.md')]);
});

test('#3642 context-cost: a source resolving to the plugin root itself still escapes (strictness kept)', () => {
  assert.equal(parseComposeCallLine(composeLine(''), '/r/plugin').unparsed, true);
});
```

- [ ] **Step 2: Run to verify the three ..foo cases fail**

Run: `node --test --test-name-pattern "3642" tests/bin-lib/path-guard/callers-characterization.test.js`
Expected: FAIL after Step 1 — 3 failures (visual-decide `null`, engine-verify `fail`, context-cost `sources` undefined); the strictness case passes.

- [ ] **Step 3: Migrate the three sites**

- server.js `resolveSafe`: after computing `full`, `return isPathContained(full, rootDir, { orEqual: true }) ? full : null;` — drop the `rel` lines; reword the comment above to say containment is decided by the shared helper rather than `path.relative` string checks.
  > **Build ruling (#3642):** server.js stays Node-builtins-only (#1202 AC 8) and so does not import `isPathContained`; it keeps a builtins-only whole-segment check (`rel.split(path.sep)[0] === '..' || path.isAbsolute(rel)`) that mirrors `isAncestorOrSelf` with `orEqual`. The ruling is recorded in the run's decisions and the SDD ledger.
- engine-verify.js `isUnderArchiveRoot`: `return isPathContained(candidate, pipelinesArchiveRoot(repoRoot));`
- context-cost.js: `const escapesRoot = (source) => !isPathContained(source, root);` — reword the comment above to say strict containment (the root itself, a `..` walk and a cross-drive path all escape) is the shared helper's answer.

- [ ] **Step 4: Run the new tests and the three sites' existing suites**

Run: `node --test tests/bin-lib/path-guard/callers-characterization.test.js tests/bin-lib/visual-decide/server.test.js tests/bin-lib/wrap-up/engine-verify.test.js tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/load.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/visual-decide/server.js plugin/bin/lib/wrap-up/engine-verify.js plugin/bin/lib/skill-audit/context-cost.js tests/bin-lib/path-guard/callers-characterization.test.js
git commit -m "Route the visual-decide, engine-verify and context-cost containment checks through isPathContained — a ..foo child is now contained, refs #3642"
```

### Task 3: Widen the conformance scan to the `startsWith('..')` idiom

**Files:**
- Modify: `tests/path-containment-conformance.test.js` (header comment lines 8-13; new scanner + tests after the existing `AC1.1` test)

**Interfaces:**
- Consumes: `stripComments`, `stripperVerdict`, `STRIPPER_VERDICT_MESSAGES` (already imported); `listJs`, `BIN_ROOT`, `ROOT` (already defined in the file).
- Produces: `scanRelDotDot(src: string, rel: string) -> string[]` (`${rel}:${line}` hits) and `assertNoRelDotDot(entries: Array<{ rel, raw }>)` — the one assertion both the real-corpus test and the planted go-red control call.

Producer enumeration (gate-over-producers): the idiom's only producers are `plugin/bin/**/*.js` sources; `git grep -n -E "startsWith\(\s*[\"'\`]\.\." -- plugin/bin` at authoring time lists the five migrated sites, `path-guard/index.js:81` (`'..' + pathImpl.sep`, not the bare idiom), and four `'...'`/`'../'` forms (`candidates-abstraction-police.js:120`, `release-local/manifest.js:159`, `skill-audit/load.js:52`, `verify/baseline.js:354`) that the regex must not flag.

- [ ] **Step 1: Write the failing tests**

```js
test('#3642 scanRelDotDot flags a bare startsWith(\'..\') in either quote style, but not \'...\', \'../\' or a comment', () => {
  const src = [
    "if (rel.startsWith('..')) return null;",
    'const out = r.startsWith("..");',
    "if (e.startsWith('...')) continue;",
    "const esc = p.startsWith('../');",
    "// rel.startsWith('..') in a comment",
  ].join('\n');
  assert.deepEqual(scanRelDotDot(src, 'f.js'), ['f.js:1', 'f.js:2']);
});

test('#3642 AC1.1: no plugin/bin JS file outside lib/path-guard/ tests containment with startsWith(\'..\')', () => {
  assertNoRelDotDot(listJs(BIN_ROOT)
    .map((file) => ({ rel: path.relative(ROOT, file).replace(/\\/g, '/'), raw: fs.readFileSync(file, 'utf8') }))
    .filter(({ rel }) => !rel.startsWith('plugin/bin/lib/path-guard/')));
});

test('#3642 AC3.1: the scan fails on a planted rel.startsWith(\'..\') containment check', () => {
  const planted = { rel: 'plugin/bin/lib/planted.js', raw: "const rel = path.relative(root, p);\nreturn !rel.startsWith('..');\n" };
  assert.throws(() => assertNoRelDotDot([planted]), /planted\.js:2/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test --test-name-pattern "3642" tests/path-containment-conformance.test.js`
Expected: FAIL after Step 1 — `scanRelDotDot is not defined`.

- [ ] **Step 3: Implement the scanner**

`const REL_DOT_DOT = /startsWith\(\s*(['"`])\.\.\1\s*\)/;` — `scanRelDotDot` mirrors `scanHandRolled` (comments blanked via `stripComments`, one hit per matching line). `assertNoRelDotDot(entries)` asserts `stripperVerdict(raw) === 'ok'` per entry (message from `STRIPPER_VERDICT_MESSAGES`), collects hits, and `assert.deepEqual(hits, [])`. Rewrite the header comment's last sentence to say the scan also rejects a `path.relative`-derived `startsWith('..')` test (#3642), outside `lib/path-guard/`.

- [ ] **Step 4: Run the whole conformance file and the AC grep**

Run: `node --test tests/path-containment-conformance.test.js`
Expected: PASS, 0 failures.

Run: `git grep -n -E "startsWith\('\.\.'" -- plugin/bin`
Expected: exactly one hit, `plugin/bin/lib/path-guard/index.js:81`.

- [ ] **Step 5: Commit**

```bash
git add tests/path-containment-conformance.test.js
git commit -m "Widen the path-containment conformance scan to startsWith('..') — a planted re-derivation now fails it, refs #3642"
```

## Spec coverage

| AC clause | Covered by |
|---|---|
| AC1.1 | Task 3 `#3642 AC1.1` test + Step 4 grep |
| AC2.1 | Tasks 1-2 `#3642 AC2.1` cases + each task's Step 4 existing-suite run (hooks.js waived: no observable change, see Task 1) |
| AC3.1 | Task 3 `#3642 AC3.1` planted control |
