# Console Backfill under `work-backend: local-files` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/claude-tweaks:tidy --console-backfill` settles Review Console residue in a `work-backend: local-files` project: filings become local record files (`createRecord`), digest lines append to `specs/digest.md`, both dedups read the local records and local digest, and Step 3's HELD gate passes `local-files`.

**Architecture:** The CLI already plans from data the procedure hands it. Two new `dispose` inputs read the local stores directly (`--records-dir`, `--digest-file`), and a new `settle-local` subcommand performs the local writes deterministically (the GitHub path's `gh` writes stay in prose; local writes have no transport, so they become testable code). A local record's console `ref` is `#{id}` — the form the live console already logs for a local-files can't-tell filing (`filed as #{number}` with `{number: id}`, `wrap-up/review-console.md`'s "Can't-tell filings", read back by `lib/console/residue.js`'s `FILED_LINE_RE`), which `backfill-apply.js`'s `FILED_REF_RE` (`/^#\d+$/`) already accepts. A local digest line's `ref` is the container path `specs/digest.md` (`LOCAL_DIGEST_REF`). The procedure (`tidy/console-backfill.md`) gains a local-files branch: the scratch worktree is on a branch, each pass's writes are committed there before `apply` cites them, and the branch lands at the end the way `tidy/step-7-5-worktree-always.md` lands Step 7's commit.

**Tech Stack:** Node 18+ CommonJS, `node --test`, no dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-10-29T002141-record-4163/work/4163-spec.md` (worktree copy)

**Scope keywords:** heldDigestComment, digestComments, console-backfill.js

## Global Constraints

- The HELD line text pinned today, verbatim: `HELD — console backfill needs work-backend: github-issues; local-files support is tracked as the backlog record "Console backfill: settle Review Console residue under work-backend: local-files"` — removed; replaced by a gate that HELDs only a value that is neither `github-issues` nor `local-files`.
- Filing under local-files uses `local-store.js`'s `createRecord` (with `deriveSlug`), never `allocateId` + `writeRecord` (spec Technical Approach; `capture/SKILL.md`'s local-files branch).
- Digest lines append to `specs/digest.md` (`_shared/materiality-floor.md` Container, `local-files`); that body is a trusted single-writer string (`_shared/materiality-floor.md` Dedup).
- `console-backfill.js` exit vocabulary stays 0 / 2 / 3 — no exit 1 (its header: "This is the Sanctioned-writer vocabulary (no exit 1)"). Per-item failures are envelope results, never an exit code.
- Governing skill `gh-api-module-pattern`, `cli-wrapper-contract.md`, quoted: "A guard added to an existing `run(argv, deps)` reaches the environment through `deps` too." and "A Split-1/2 CLI that also writes caller-named files maps a write failure to its remote-failure code and states that it is a create-only, no-lock overwrite." — every new fs read/write in the CLI goes through `deps`; the header comment states each new write's shape (records: exclusive create via `createRecord`; digest: read-modify-write of a single-writer file through `writeFileAtomic`, no lock).
- Source-scan lint: no `existsSync` / `realpathSync` token in any new or changed `plugin/bin/` file (`tests/path-guard-conformance.test.js` counts tokens per file against an allowlist). Absence is read as an `ENOENT` catch.
- Never add an `auto:*` or `bot:*` grant through a backfill filing (`console-backfill.md` Step 7): a local record's facets carry `grants: { build: false, merge: false }` and the default `bot` whatever the `Labels:` header says.
- Tests: neighbouring files' style (`node:test`, `node:assert/strict`, tmp-dir fixtures cleaned in `after`/`finally`). Commit tests only where listed below; scratch checks stay scratch.
- Commit message style: `{Verb} {what} — {detail}`, `refs #4163`, never `closes`/`fixes`; end each with `Claude-Session: https://claude.ai/code/session_01CcCLFsxPTfvN6CxgUbjKPy`.
- Size: `plugin/skills/tidy/console-backfill.md` is 21,083 B against `RAIL_BYTES` 52,500 B — Task 4 adds ~3 KB, leaving ~28 KB headroom.

## Review Focus

1. `specs/digest.md` already holding an `## Archived {date}` section (`tidy/digest-sweep.md` expiry) — new lines must land above it, never inside the archive. Pinned in Task 2.
2. A digest line already in the local body (an interrupted earlier pass) — it settles as a duplicate with `ref: specs/digest.md`, not left ref-less and unsettled (today `heldDigestComment` returns `{ url: null }` for a string body, so the item would fall out as unsettled). Pinned in Task 1.
3. A closed local record carrying the fingerprint — `queryRecords(dir, {})` hides closed records, so dedup must read open and closed (`gh issue list --state all` parity). Pinned in Task 2.
4. A proposal whose header lacks a valid `Defer-reason:` — files nothing, reported `no-defer-reason`, same as the GitHub path. Pinned in Task 2.
5. No `specs/` directory and no `specs/digest.md` at all (first backfill in the project) — dispose reads empty stores, settle-local creates both. Pinned in Tasks 2 and 3.

---

### Task 1: Local digest duplicates carry a ref

**Files:**
- Modify: `plugin/bin/lib/console/backfill-dispose.js` (`commentRef`, `heldDigestComment`, `planBatch` doc comment, `module.exports`)
- Test: `tests/bin-lib/console/backfill-dispose.test.js`

**Interfaces:**
- Produces: `LOCAL_DIGEST_REF = 'specs/digest.md'` exported from `backfill-dispose.js`. `planBatch({ digestComments })` accepts either the GitHub comment array or the local-files digest body (a string); a line held in the string settles with `ref: LOCAL_DIGEST_REF`.

- [ ] **Step 1: Write the failing tests** (append to `backfill-dispose.test.js`, reusing its `plan`, `workList`, `noClaimItem`, `findingItem`, `digestV` helpers)

```js
test('local-files: a digest line already in specs/digest.md is a duplicate whose ref is the container path', () => {
  const item = noClaimItem({ itemId: 'bf:a' });
  const line = plan({ workList: workList([item]) }).digest.lines[0];
  const out = plan({ workList: workList([item]), digestComments: `# Digest\n\n${line}\n` });
  assert.deepStrictEqual(out.digest.lines, []);
  assert.deepStrictEqual(out.digest.duplicates, ['bf:a']);
  assert.strictEqual(LOCAL_DIGEST_REF, 'specs/digest.md');
  assert.deepStrictEqual(out.entries.map((e) => [e.itemId, e.outcome, e.ref]), [['bf:a', 'digested', 'specs/digest.md']]);
  // Orthogonal: a body without the line routes it as new, ref left for the procedure.
  const fresh = plan({ workList: workList([item]), digestComments: '# Digest\n' });
  assert.deepStrictEqual(fresh.digest.lines, [line]);
  assert.deepStrictEqual(fresh.entries.map((e) => e.ref), [null]);
});

test('local-files: a no-verdict finding whose line the local body holds settles digested with the container ref', () => {
  const a = findingItem({ itemId: 'bf:a', itemHash: 'ha' });
  const line = plan({ workList: workList([a]), verdicts: { 'bf:a': digestV } }).digest.lines[0];
  const out = plan({ workList: workList([a]), verdicts: {}, digestComments: `${line}\n` });
  assert.deepStrictEqual(out.awaitingVerdict, []);
  assert.deepStrictEqual(out.entries.map((e) => [e.outcome, e.ref]), [['digested', 'specs/digest.md']]);
});
```

Add `LOCAL_DIGEST_REF` to the file's `require('../../../plugin/bin/lib/console/backfill-dispose')` destructure.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/console/backfill-dispose.test.js`
Expected: FAIL after Step 1 — the two new tests fail (`LOCAL_DIGEST_REF` undefined; ref `null`)

- [ ] **Step 3: Implement** — in `heldDigestComment`, the string branch returns `{ url: LOCAL_DIGEST_REF }` when the body holds the line; export `LOCAL_DIGEST_REF`. Update the two comments that say "or null when it carries none (a local-files body)" and the `planBatch` doc's `digestComments` line to name the string form and its ref.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/console/backfill-dispose.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/console/backfill-dispose.js tests/bin-lib/console/backfill-dispose.test.js
git commit -m "Settle a local digest duplicate with the container ref — refs #4163"
```

### Task 2: `backfill-local.js` — read the local stores, write the local settlements

**Role:** integration
**Review risk:** high

**Files:**
- Create: `plugin/bin/lib/console/backfill-local.js`
- Test: `tests/bin-lib/console/backfill-local.test.js`

**Interfaces:**
- Consumes: `LOCAL_DIGEST_REF` (Task 1); `queryRecords`, `createRecord`, `deriveSlug` (`../issues/local-store`); `parseRecordFacets`, `TYPES`, `DEFER_REASONS` (`../issues/record`); `writeFileAtomic` (`../atomic-write`).
- Produces:
  - `existingFromRecords(dir: string) -> Array<{ number: number, title: string, body: string }>` — every record in `dir`, open **and** closed (`queryRecords(dir, { closed: false })` plus `queryRecords(dir, { closed: true })`), `number` = the record id; `[]` for a missing dir.
  - `readDigestBody(file: string, readFile = fs.readFileSync-utf8) -> string` — `''` on `ENOENT`, rethrows any other error.
  - `appendDigestLines(body: string, lines: string[]) -> string` — inserts `lines` (each on its own line) immediately before the first line matching `/^## Archived\b/m`, else at the end; ensures exactly one `\n` separates prior content from the new lines; an empty `body` yields `lines.join('\n') + '\n'`.
  - `parseProposal(text: string) -> { header: { title, type, labels: string[], deferReason }, body: string }` — header = lines before the first blank line, keys matched by name (`^Title:`, `^Type:`, `^Labels:`, `^Defer-reason:`), `Labels: none` or no line → `[]`; body = everything after that blank line, unchanged.
  - `settleLocal({ plan, recordsDir, digestFile, deps }) -> { refs: Record<string,string>, filed: Array<{ itemId, ref, path }>, digested: { itemIds: string[], lines: number }, failed: Array<{ itemId, reason }>, written: string[] }` where `plan` is `console-backfill.js dispose`'s printed plan (`file[]` entries carry `itemId`, `title`, `path`), and `deps = { readFile, writeFile, createRecord, listSlugs }` (defaults: `fs` utf8 read, `writeFileAtomic`, `local-store.createRecord`, a `fs.readdirSync`-based slug list returning `[]` on a missing dir).
- `settleLocal` rules:
  - Each `plan.file[]`: read the proposal at `path`; a `deferReason` not in `DEFER_REASONS` → `failed` `no-defer-reason`, nothing written. Otherwise facets = `parseRecordFacets(labels)` (labels as `{ name }` objects if that is what it takes — read its `normalizeLabelNames`), then `type` = header `Type:` when in `TYPES` else `null`, `grants` = `{ build: false, merge: false }`, `bot` = the default from `sharedFacetDefaults()`; `createRecord(recordsDir, { slug: deriveSlug(title, listSlugs(recordsDir)), title: file.title, body, facets })`; ref `#${record.id}`. A throw → `failed` `write-failed: {message}`; the loop continues.
  - Digest: the items whose lines are new are `plan.dispositions` with `action === 'digest'` and `itemId` not in `plan.digest.duplicates`, mapped by `digest.line` (the same mapping the procedure's digest fence makes). When `plan.digest.lines` is non-empty: `writeFile(digestFile, appendDigestLines(readDigestBody(digestFile), plan.digest.lines))` (create the parent dir first via `fs.mkdirSync(..., { recursive: true })` through deps or inline); each such item's ref = `LOCAL_DIGEST_REF`. A throw → every one of those items `failed` `write-failed: {message}`.
  - `written` lists each record path and `digestFile` when written. No `existsSync`/`realpathSync`.
- Header comment: pure apart from injected fs; records are exclusive creates (`createRecord`'s id claim); the digest is a read-modify-write of a single-writer file (`_shared/materiality-floor.md`), atomic rename, no lock.

- [ ] **Step 1: Write the failing tests** in `tests/bin-lib/console/backfill-local.test.js` (tmp dirs via `fs.mkdtempSync`; real `createRecord`/`queryRecords`, never hand-written record files except the closed one written through `writeRecord` + `closeRecord`):

```js
test('existingFromRecords reads open and closed records as {number,title,body}, and [] for a missing dir', ...);
  // createRecord one open, one then closeRecord'd; assert both numbers present, body contains its marker; missing dir -> [].
test('readDigestBody is "" for an absent file and rethrows another error', ...);
  // readFile stub throwing { code: 'EACCES' } -> assert.throws.
test('appendDigestLines lands new lines above an ## Archived section', () => {
  const body = '# Digest\n\n- old\n\n## Archived 2026-01-01\n\n- expired\n';
  assert.strictEqual(appendDigestLines(body, ['- new']), '# Digest\n\n- old\n- new\n\n## Archived 2026-01-01\n\n- expired\n');
  assert.strictEqual(appendDigestLines('', ['- a', '- b']), '- a\n- b\n');
  assert.strictEqual(appendDigestLines('- x', ['- y']), '- x\n- y\n');
});
test('parseProposal reads the header by key and keeps the body unchanged', ...);
  // 'Title: T\nType: task\nLabels: needs:definition\nDefer-reason: needs-human-decision\n\nbody\n\nmore\n' -> header + body 'body\n\nmore\n'; 'Labels: none' -> [].
test('settleLocal files a proposal as a local record with #id ref, type and needs-definition facets, and no grant', ...);
  // plan.file one entry, proposal header carrying 'Labels: needs:definition, auto:build'; assert refs[itemId] === `#${id}`,
  // readRecord(path).facets.type === 'task', .needsDefinition === true, .grants deepEqual {build:false,merge:false}; written includes path.
test('settleLocal refuses a proposal with no valid Defer-reason and files nothing', ...);
  // failed [{ itemId, reason: 'no-defer-reason' }], refs {}, specs dir has no record.
test('settleLocal appends new digest lines, skips duplicates, refs each new item to specs/digest.md', ...);
  // plan with two digest dispositions, one in digest.duplicates; file absent first -> created with the one new line; refs only for the new item.
test('settleLocal reports a write failure per item and keeps going', ...);
  // deps.createRecord throws for the first file entry -> failed write-failed, second entry still filed.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/console/backfill-local.test.js`
Expected: FAIL with "Cannot find module '../../../plugin/bin/lib/console/backfill-local'"

- [ ] **Step 3: Implement `plugin/bin/lib/console/backfill-local.js`** per the Interfaces block.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/console/backfill-local.test.js tests/path-guard-conformance.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/console/backfill-local.js tests/bin-lib/console/backfill-local.test.js
git commit -m "Add backfill-local — read and write the local-files record and digest stores for console backfill, refs #4163"
```

### Task 3: CLI — `dispose --records-dir/--digest-file` and `settle-local`, with the AC fixture

**Role:** integration
**Review risk:** high

**Files:**
- Modify: `plugin/bin/console-backfill.js` (header comment, `USAGE`, `COMMANDS`, `invocationProblem`, `runDispose`, new `runSettleLocal`, `run`)
- Modify: `docs/plugin-structure.md:164` (the `console-backfill.js` usage line) and `:38` (add `backfill-local.js` beside the other backfill modules)
- Test: `tests/bin-lib/console/backfill-cli.test.js`

**Interfaces:**
- Consumes: Task 2's `existingFromRecords`, `readDigestBody`, `settleLocal`.
- Produces (CLI):
  - `dispose ... [--existing <issues.json> | --records-dir <dir>] [--digest-comments <comments.json> | --digest-file <file>]` — both of a pair given → exit 2 (`--existing and --records-dir are exclusive`, same wording shape for the digest pair). `--records-dir` → `existingIssues = existingFromRecords(dir)`; `--digest-file` → `digestComments = readDigestBody(file)` (a string). Paths resolve against `ctx.cwd`.
  - `settle-local --plan <plan.json> --records-dir <dir> --digest-file <file> [--refs-out <refs.json>]` — runs `settleLocal`, prints `{ filed, digested, failed, written, refs }` as one JSON line; `--refs-out` writes the `refs` object (the procedure's `{REFS}`). Exit 0 done (per-item `failed` entries included); 2 missing flag or an unparseable/wrong-shape `--plan` (`must be a dispose plan ({ file: [...], digest: {...}, dispositions: [...] })`); 3 `--refs-out` unwritable. Like `dispose`, it needs no pipelines root.
  - All new reads/writes go through `ctx.deps` (`readFile`, `writeFile`, `mkdir`); `realDeps` gains nothing new unless `settleLocal` needs `createRecord`/`listSlugs` passed through — pass them only if a test needs to fake them.

- [ ] **Step 1: Write the failing tests** in `backfill-cli.test.js`, reusing `fixture`, `closedRun`, `writeConsole`, `writeDecisions`, `writeStaged`, `call`, `json`, `SINGLE`, `NOPATH`, `KEEP`, `PENDING`, `decisionId`, `listToFile`. A helper `localPass(f, { verdicts, mutate })` runs one backfill pass the way the procedure does: `list --main-sha … --out` → optional `mutate(workList)` rewritten to the file → `dispose --work-list --verdicts --records-dir {root}/specs --digest-file {root}/specs/digest.md --out-dir` → plan to a file → `settle-local --plan --records-dir --digest-file --refs-out` → entries = plan.entries with null refs filled from refs and `reuse`/`digest.sameAs` twins resolved (the settle fence's logic) → `apply --entries`. Returns `{ plan, settled, applied }`.

```js
test('AC1.1: a local-files pass over a confirmed finding, a digest-bound item and a dismissal leaves one record, one digest line, and every console item settled with a ref', () => {
  // closed run: console [KEEP(decisionId(SINGLE)), KEEP(decisionId(NOPATH)), PENDING('x-1.md.shadow-dup')],
  // decisions [SINGLE, NOPATH], staged x-1.md and x-1.md.shadow-dup with identical bytes.
  // verdicts: the finding's itemId -> { outcome: 'confirmed', severity: 'medium', evidence: { path: 'plugin/bin/lib/console/residue.js', line: 40, quote: 'x' }, reason: 'confirmed', recommendation: null }
  // Assert: queryRecords(specs, {}) length 1; specs/digest.md has exactly one line matching /^- /; console.json items all have
  // a non-empty settled.ref; the filed item's ref === `#${record.id}`; the digested one's === 'specs/digest.md'; the dismissed one's starts 'duplicate of staged/'.
});
test('AC2.1: a second pass over the same fixture writes nothing', () => {
  // after AC1.1's pass: snapshot specs/ and the run dir; second list is empty; dispose+settle-local+apply on it leave both snapshots byte-identical.
});
test('AC3.1: a pass interrupted after the record write and resumed after a claim-text change reuses that record', () => {
  // pass 1 stops after settle-local (no apply). Pass 2: mutate the finding item's claimText (simulating a claim-heuristics change),
  // verdicts {} — assert plan.reuse === [{ itemId, number: id }], plan.file === [], one record still, console item settled '#id'.
  // Orthogonal control: with the record deleted before pass 2 the same finding comes back in awaitingVerdict.
});
test('dispose rejects --existing with --records-dir and --digest-comments with --digest-file', ...);  // exit 2 each
test('dispose with --records-dir and --digest-file reads empty stores when specs/ does not exist', ...); // exit 0, plan.file has the filing
test('settle-local: exit 2 on a missing flag or a non-plan --plan, exit 3 when --refs-out cannot be written', ...);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/console/backfill-cli.test.js`
Expected: FAIL after Step 1 — `unknown argument for dispose: --records-dir` and `unknown subcommand: settle-local`

- [ ] **Step 3: Implement** the CLI changes per Interfaces; update the header comment (the usage lines, `settle-local`'s envelope and exit codes, and that it is the CLI's one record/digest writer, used only under `work-backend: local-files` — the GitHub path's writes stay with the procedure's `gh` calls), `USAGE`, and `docs/plugin-structure.md` lines 164 and 38.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/console/backfill-cli.test.js tests/bin-lib/console/backfill-local.test.js tests/path-guard-conformance.test.js tests/bin-lib/exit-code-conformance.test.js`
Expected: PASS

- [ ] **Step 5: Real-input probe** — from the worktree, against this repo's real archived consoles (read-only; `dispose` and `settle-local` write only to scratch paths):

Run: `node plugin/bin/console-backfill.js list --main-sha HEAD --out {scratch}/wl.json` then `node plugin/bin/console-backfill.js dispose --work-list {scratch}/wl.json --verdicts {scratch}/v.json --records-dir {scratch}/specs --digest-file {scratch}/specs/digest.md --out-dir {scratch}/out > {scratch}/plan.json` (with `{}` in `v.json`), then `settle-local --plan {scratch}/plan.json --records-dir {scratch}/specs --digest-file {scratch}/specs/digest.md`. Independent count: `grep -c '^- ' {scratch}/specs/digest.md` must equal the plan's `digest.lines.length`, and `ls {scratch}/specs | grep -c '^[0-9]'` must equal `file.length` minus `failed.length`. Record both numbers in the task report. (`{scratch}` = a fresh dir under the session scratchpad.)

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/console-backfill.js docs/plugin-structure.md tests/bin-lib/console/backfill-cli.test.js
git commit -m "Teach console-backfill.js the local-files stores — dispose --records-dir/--digest-file and settle-local, refs #4163"
```

### Task 4: Procedure — the local-files branch in `tidy/console-backfill.md`, and its pins

**Role:** judgment

**Files:**
- Modify: `plugin/skills/tidy/console-backfill.md` (intro paragraph 2; Steps 3, 5, 6.3, 6.4, 7, 10)
- Modify: `tests/tidy-console-backfill-conformance.test.js` (the `work-backend gate` FACT at line 55; new FACTs below)
- Read only: `plugin/skills/_shared/materiality-floor.md` (Container, Dedup — cited, unchanged), `plugin/skills/tidy/step-7-5-worktree-always.md` (landing branches — cited, unchanged), `plugin/skills/_shared/scratch-worktree.md` (§2, §4, §6 — cited, unchanged)

**Interfaces:**
- Consumes: Task 3's CLI flags and `settle-local` envelope; Task 1's `specs/digest.md` ref; `#{id}` local record refs.

Content each section must carry (the implementer writes the prose in the file's voice):
- **Intro:** the procedure's writes are the `gh` writes under `github-issues`, and `settle-local` under `local-files` (the CLI's one record/digest writer); `apply` stays the only `console.json` writer.
- **Step 3 (Backend gate):** `github-issues` and `local-files` (a missing flag is `local-files`) both proceed; every step that differs says so as "Under `local-files`". Any other value ends here with exactly: `HELD — console backfill supports work-backend: github-issues or local-files; {value} is neither`.
- **Step 5:** under `local-files`, the scratch worktree is created at `{mainSha}` **on a branch** (not detached) because records and the digest are written and committed in it (`_shared/scratch-worktree.md` §4, one commit per pass); `resolve-tiebreak` still runs against it. Teardown under `local-files` comes after landing (Step 10).
- **Step 6.3:** under `local-files`, no fetch — the stores are the scratch worktree's `specs/` and `specs/digest.md`.
- **Step 6.4:** under `local-files`, `dispose` takes `--records-dir "{scratch worktree}/specs" --digest-file "{scratch worktree}/specs/digest.md"` in place of `--existing`/`--digest-comments` (both read open and closed records; the digest body is trusted, `_shared/materiality-floor.md` Dedup).
- **Step 7:** under `local-files`, replace the File and Digest bullets' `gh` writes with one call — `node "${CLAUDE_PLUGIN_ROOT}/bin/console-backfill.js" settle-local --plan "{PLAN}" --records-dir "{scratch worktree}/specs" --digest-file "{scratch worktree}/specs/digest.md" --refs-out "{REFS}"` — which runs the same `Defer-reason:` check, files each proposal with `createRecord` (never `allocateId` + `writeRecord`), appends the pass's new lines to `specs/digest.md` above any `## Archived` section, and writes `{REFS}`. Each `failed` entry joins the failed set with its reason (`no-defer-reason` keeps the run `PARTIAL`, as on GitHub). Then commit every `written` path in the scratch worktree by explicit path, as its own commit, **before** `apply` — a record `console.json` cites must be committed. A local record's ref is `#{id}` (the form the live console logs for a local-files filing); a digest line's ref is `specs/digest.md`. A crash before the commit leaves uncommitted files the next pass's `--records-dir` read still sees, so nothing is filed twice.
- **Step 10:** under `local-files`, land the scratch branch the way `tidy/step-7-5-worktree-always.md` lands Step 7's commit (its `local-merge` and `pr-first` branches), then tear down; the digest line of the report names `specs/digest.md` and the count in place of a comment URL.

- [ ] **Step 1: Update the conformance FACTS first (failing)** — in `tests/tidy-console-backfill-conformance.test.js`, replace the `work-backend gate` entry and its `// R12: GitHub Issues only.` comment with:

```js
  // R12 (#4163): both backends; any other value HELDs.
  ['work-backend gate', /HELD — console backfill supports work-backend: github-issues or local-files; \{value\} is neither/],
  ['local-files settle-local writer', /settle-local --plan "\{PLAN\}" --records-dir "\{scratch worktree\}\/specs" --digest-file "\{scratch worktree\}\/specs\/digest\.md" --refs-out "\{REFS\}"/],
  ['local-files dispose stores', /--records-dir "\{scratch worktree\}\/specs" --digest-file "\{scratch worktree\}\/specs\/digest\.md"` in place of `--existing`/],
  ['local-files commit before apply', /committed[^\n]{0,40}before `apply`/],
  ['local record ref form', /A local record's ref is `#\{id\}`/],
  ['local-files never allocateId', /never `allocateId` \+ `writeRecord`/],
```

(`local-files dispose stores` and `local-files settle-local writer` must each match exactly one distinct sentence — the go-red test strips each FACT's matches and requires that only that FACT goes missing; adjust either regex if the prose makes one match the other's text.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tidy-console-backfill-conformance.test.js`
Expected: FAIL — `console-backfill.md no longer states these decisions` listing the six new/changed facts

- [ ] **Step 3: Edit `plugin/skills/tidy/console-backfill.md`** per the content list above. Keep every other pinned FACT's text intact.

- [ ] **Step 4: Run tests to verify they pass, and check the moved-prose pins**

Run: `node --test tests/tidy-console-backfill-conformance.test.js`
Expected: PASS
Run: `git grep -n -F -e 'local-files support is tracked' -e 'GitHub Issues only' -- plugin tests docs`
Expected: no output (the old HELD sentence and its comment are gone everywhere)
Run: `wc -c plugin/skills/tidy/console-backfill.md`
Expected: under 52500

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/tidy/console-backfill.md tests/tidy-console-backfill-conformance.test.js
git commit -m "Run console backfill under work-backend: local-files — settle-local writes, commit before apply, refs #4163"
```

---

## Spec coverage map

| Spec item | Task |
|---|---|
| Deliverable 1 (local record files via capture's writer; digest to `specs/digest.md`) | 2, 3, 4 |
| Deliverable 2 (fingerprint + item-marker dedup and digest dedup read local stores) | 1, 2, 3 |
| Deliverable 3 (gate passes `local-files`; HELD narrowed; pin updated) | 4 |
| AC1.1 | 3 (`AC1.1:` test) |
| AC2.1 | 3 (`AC2.1:` test) |
| AC3.1 | 3 (`AC3.1:` test) |
| Gotcha 1 (commit per write before `console.json` cites it) | 4 (Step 7 prose, FACT `local-files commit before apply`) |
| Gotcha 2 (local ref form accepted by `apply` and the residue reader) | 3 (AC1.1 asserts `#{id}` settles through `apply`); `lib/console/residue.js` reads only `resolution`, never `ref` — Waived `plugin/bin/lib/console/residue.js`: read in authoring, no change needed |
| Gotcha 3 (`heldDigestComment` takes the local form as trusted) | 1 |
| Gotcha 4 (HELD pin + title) | 4 |

Waived `specs/digest.md`: a consumer project's local digest container, not a file in this repo — Task 2's `appendDigestLines`/`settleLocal` and Task 3's AC fixture write it inside tmp fixture projects.
Waived `lib/console/residue.js`: read in authoring (it reads `resolution` only, never `ref`), so a `#{id}` or `specs/digest.md` ref needs no change there.
Waived `plugin/bin/lib/issues/local-store.js`: read only (Task 2 consumes `createRecord`/`queryRecords`/`deriveSlug`).
Waived `plugin/skills/capture/SKILL.md`: read only (names `createRecord` as the local-files writer).
Waived `plugin/skills/_shared/materiality-floor.md`: read only (Container and Dedup cited by Task 4).
