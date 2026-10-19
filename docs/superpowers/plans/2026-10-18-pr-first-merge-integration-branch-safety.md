# pr-first merge: integration-branch safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forbid rewriting the integration branch on the pr-first merge path, stop composing `gh pr merge` title/body by `eval`-ing `compose-subject.js --shell`, and route GitHub's `Protected branch rules not configured` auto-merge rejection to Step 3 branch 1.

**Architecture:** `compose-subject.js` gains an additive file-output mode (`--title-out <path> --body-out <path>`) so the composed text reaches `gh` only via files (`-t "$(cat …)"` + `--body-file`), never through shell parsing. `_shared/pr-first-merge.md` carries the one statement of the no-rewrite rule; `dispatch/task-prompt.md`'s second-call template cites it through the composed `merge` bundle. Conformance tests pin all three.

**Tech Stack:** Node 18+ CommonJS, `node --test`, markdown skill prose.

**Spec:** `.claude-tweaks/pipelines/2026-10-18T212833-record-3347/work/3347-spec.md` (record #3347)

## Global Constraints

- Contract change discipline: `--shell` stays supported (four local-merge fences still use it — `_shared/local-merge-auto-finish.md`, `wrap-up/auto-merge-short-circuit.md`, `dispatch/settle-and-merge.md`, `flow/worktree-merge.md`); the new flags are additive.
- The prohibition is stated **once** in `_shared/pr-first-merge.md`; every other file cites it, never restates its terms.
- `dispatch/task-prompt.md` fenced-template citations of `_shared/*.md` must name the composed bundle and carry `(if that bundle is absent, read \`_shared/pr-first-merge.md\` directly)` on the same physical line (`tests/dispatch-prompt-bundle-citations.test.js`).
- Byte budgets: `_shared/pr-first-merge.md` is 33,853 B. Its composed `merge` bundle peaks at 47,658 B at its `wrap-up/auto-merge-short-circuit.md`/`review-console.md` call sites, against the 51,200 B composed ceiling (`plan-audit.js` headroom, `context-cost.js` `overComposedCeiling`). Keep the **total** net growth of `pr-first-merge.md` across Tasks 2-4 at or under 2,500 B (hard limit 3,542 B). `dispatch/task-prompt.md` is 37,889 B against the 51,200 B shared ceiling.
- Commit messages: `{Verb} {what} — {detail}`, body `refs #3347`, never `closes`/`fixes`.

## Review Focus

1. A title containing `'`, `$`, or a backtick must reach `gh -t` byte-identical. Task 1 pins this with a `$`/backtick/quote title fixture.
2. A title file with a trailing newline would leave `-t "$(cat …)"` unaffected, but the CLI writes the title with no trailing newline so the file is exact. Task 1 asserts the exact bytes.
3. `--title-out` without `--body-out` (or the reverse), or either flag combined with `--shell`, is a malformed invocation (exit 1) and must never half-write. Task 1 tests both.
4. A write failure must not exit 0. Task 1 makes a failing `writeFile` exit 3 with a stderr naming the path.
5. A sweep that finds zero `gh pr merge` fences would pass vacuously. Task 2's sweep asserts it found at least the two pr-first fences.

## Prohibition-vs-existing-mandate exceptions (named, not reconciled by edit)

- `_shared/local-merge-auto-finish.md:154` — `git reset --hard ORIG_HEAD` undoes an **unpushed local** merge under `local-merge`; outside `pr-first-merge.md`'s scope (nothing published). The rule's wording scopes itself to the published (`origin`) integration branch.
- `_shared/git-discipline.md`'s "Realigning a diverged local branch to origin" — moves a local ref *to match* origin, never rewrites origin. Not a rewrite of the published branch.

## Verbatim-command run-once record

- `gh pr merge --help` (gh 2.102.0, run 2026-10-18): `-t, --subject text`, `-F, --body-file file`, `--auto`, `--squash` all present.

---

### Task 1: `compose-subject.js` file-output mode

**Files:**
- Modify: `plugin/bin/lib/compose-subject.js` (header Usage/Output/exit-code comment, `USAGE`, `parseArgs`, `realDeps`, `run`'s output branch)
- Test: `tests/bin-lib/compose-subject.test.js`

**Interfaces:**
- Produces: CLI flags `--title-out <path>` and `--body-out <path>` (both or neither; neither with `--shell`). On success, writes `composed.title` (no trailing newline) to the title path, `composed.body` verbatim to the body path, still prints the JSON `{"title","body"}` line on stdout, and exits 0. Failure exits: 1 for a malformed combination; 3 when a write throws, with stderr `compose-subject.js: could not write {path}: {message}`.
- Produces: `deps.writeFile(path, text)`. `realDeps.writeFile` = `fs.writeFileSync(path, text, 'utf8')`. `fakeDeps` gains `writeFile` recording `{path, text}` into `out.writes` (and throwing when given `failWrite`).

- [ ] **Step 1: Write the failing tests** in `tests/bin-lib/compose-subject.test.js`:
  - `test('--title-out/--body-out write the composed title and body to files byte-exact; stdout still carries the JSON', …)`: use record `2262` (title carries `'`). Assert exit 0, `out.writes` equals `[{path:'/t/title.txt', text: composed.title}, {path:'/t/body.md', text: composed.body}]` where `composed = JSON.parse(out.stdout)`. Also assert `!composed.title.endsWith('\n')`.
  - `test('--title-out round-trips a title with $, backtick and quote through gh-style -t "$(cat file)" unchanged', …)`: add fixture record `2263` titled ``Cost $HOME `x` it's`` (type:bug, with Overview + Release Note). Write the real files to an `fs.mkdtempSync` dir via `realDeps.writeFile`-equivalent (`deps.writeFile = (p,t)=>fs.writeFileSync(p,t)`), then `spawnSync('sh', ['-c', 'printf "%s" "$(cat "$1")"', '_', titlePath])` and assert stdout === `` "fix: Cost $HOME `x` it's (#2263)" ``.
  - `test('--title-out without --body-out, --body-out without --title-out, or either with --shell exits 1 and writes nothing', …)`: three `run` calls, each `=== 1`, `out.writes.length === 0`, stderr matches `/--title-out and --body-out/` or `/--shell/`.
  - `test('a failing write exits 3 naming the path', …)`: `fakeDeps({ failWrite: true })`, assert `=== 3`, stderr matches `/could not write \/t\/title\.txt/`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/bin-lib/compose-subject.test.js`
Expected: FAIL (`unknown argument: --title-out`).

- [ ] **Step 3: Implement** in `plugin/bin/lib/compose-subject.js`: `parseArgs` accepts `--title-out`/`--body-out` (value-taking, same missing-value guard as `--tag`), sets `opts.titleOut`/`opts.bodyOut` (default `null`). Return `{ error: '--title-out and --body-out must be passed together' }` when exactly one is set, and `{ error: '--title-out/--body-out cannot be combined with --shell' }` when either is set with `--shell`. In `run`, after composing and before printing: when `opts.titleOut` is set, write the title, then the body, through `deps.writeFile` in a try/catch (a throw → the stderr line above, return 3), then fall through to the existing JSON stdout branch. Update the header comment (Usage line, Output paragraph naming the file mode as the form `gh pr merge` sites use, exit-code 3 clause) and `USAGE`.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/bin-lib/compose-subject.test.js`
Expected: PASS (all tests, including the pre-existing `--shell` round-trip test, unchanged).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/compose-subject.js tests/bin-lib/compose-subject.test.js
git commit -m "Add compose-subject --title-out/--body-out file mode — merge text never passes through shell parsing" -m "refs #3347"
```

### Task 2: Migrate pr-first Step 3 merge fences off `eval` + sweep test

**Files:**
- Modify: `plugin/skills/_shared/pr-first-merge.md` (Step 3 opening fence, ~line 291-296, and branch 1's degrade fence, ~line 329-334)
- Modify: `plugin/bin/lib/release/subject.js:2` (header comment `-t/-b` → `-t/--body-file`)
- Test: `tests/merge-subject-composer-conformance.test.js`

**Interfaces:**
- Consumes: Task 1's `--title-out`/`--body-out`.

- [ ] **Step 1: Update and write the tests** in `tests/merge-subject-composer-conformance.test.js`:
  - Replace `PR_FIRST_COMPOSER_CALL` with `/node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/compose-subject\.js" [^\n]*--pr \{pr-number\} --title-out "\{title-file\}" --body-out "\{body-file\}"/`, and the squash-site regex in `'pr-first-merge.md: both gh pr merge sites squash …'` with `/gh pr merge \{pr-number\} --repo \{owner\}\/\{repo\} (--auto )?--squash -t "\$\(cat "\{title-file\}"\)" --body-file "\{body-file\}"/g`. Keep both `=== 2` counts.
  - Add a frozen `PRE_3347_PR_FIRST_FENCE` constant holding the current Step 3 fence verbatim (the three lines `SUBJECT_EXPORTS=$(node "${CLAUDE_PLUGIN_ROOT}/bin/compose-subject.js" {issue-list} --tag {tag} --pr {pr-number} --shell) || exit 1` / `eval "$SUBJECT_EXPORTS"` / `gh pr merge {pr-number} --repo {owner}/{repo} --auto --squash \` + `  -t "$SUBJECT_TITLE" -b "$SUBJECT_BODY"`).
  - Add `function evalComposedMergeFences(blocks)`: returns every fenced block (lines between `^\s*```` delimiters) that contains `gh pr merge` **and** matches `/compose-subject\.js[^\n]*--shell|eval "\$SUBJECT_EXPORTS"|"\$SUBJECT_(TITLE|BODY)"/`.
  - `test('AC2.1/AC2.2: no gh pr merge fence in plugin/skills/** eval-composes compose-subject --shell output', …)`: walk `plugin/skills/**/*.md`, collect fenced blocks; assert `evalComposedMergeFences(all)` is empty (message lists `{file}`), and assert the count of fences containing both `gh pr merge` and `compose-subject.js` is `>= 2` (non-vacuity). Go-red: assert `evalComposedMergeFences([PRE_3347_PR_FIRST_FENCE.split('\n')]).length === 1` — same function, mutated input.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/merge-subject-composer-conformance.test.js`
Expected: FAIL (squash-site count 0, sweep finds the two eval fences).

- [ ] **Step 3: Rewrite both fences in `_shared/pr-first-merge.md`.** Step 3's opening fence becomes three lines, each its own Bash call:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" MERGE_TITLE=merge-title-{pr-number}.txt MERGE_BODY=merge-body-{pr-number}.md
node "${CLAUDE_PLUGIN_ROOT}/bin/compose-subject.js" {issue-list} --tag {tag} --pr {pr-number} --title-out "{title-file}" --body-out "{body-file}"
gh pr merge {pr-number} --repo {owner}/{repo} --auto --squash -t "$(cat "{title-file}")" --body-file "{body-file}"
```

  Follow it with one short paragraph saying four things. Run each line as its own Bash call. Paste the two paths the first line prints literally as `{title-file}`/`{body-file}`, because a fresh shell per call drops variables. A non-zero composer exit stops before any merge (the old `|| exit 1`). The composed text reaches `gh` only through those files, never via `eval` or a shell variable, since shell interpretation of it garbled #3325's squash commit. Branch 1's degrade fence becomes the same composer line plus `gh pr merge {pr-number} --repo {owner}/{repo} --squash -t "$(cat "{title-file}")" --body-file "{body-file}"`, which re-runs its own guarded composer call. Update `release/subject.js:2`'s comment.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/merge-subject-composer-conformance.test.js tests/pr-first-merge.test.js tests/bin-lib/skill-audit/context-cost.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/pr-first-merge.md plugin/bin/lib/release/subject.js tests/merge-subject-composer-conformance.test.js
git commit -m "Compose pr-first merge title/body from files — no eval of compose-subject --shell output" -m "refs #3347"
```

### Task 3: State the no-rewrite rule once; cite it from the second-call template

**Files:**
- Modify: `plugin/skills/_shared/pr-first-merge.md` (new `## Never rewrite the integration branch` section directly after `## Precondition`)
- Modify: `plugin/skills/dispatch/task-prompt.md` (second-call fenced template, the `**\`integration-model: pr-first\`**` paragraph ~line 365-378)
- Test: `tests/pr-first-merge.test.js`

- [ ] **Step 1: Write the failing tests** in `tests/pr-first-merge.test.js`:
  - `function assertNoRewriteRule(text)`: locate `## Never rewrite the integration branch`, slice to the next `\n## `, and assert that slice matches each of `/force-push/`, `/\breset\b/`, `/rewrite/`, `/DONE_WITH_CONCERNS/`, `/decisions\.md/`, `/#3325/`.
  - `test('AC1.1: pr-first-merge.md states the integration-branch no-rewrite rule', () => assertNoRewriteRule(MERGE))`.
  - Go-red: `test('AC1.1 go-red: the pre-#3347 file (no such section) fails the same assertion', () => assert.throws(() => assertNoRewriteRule(PRE_3347_MERGE_HEAD)))`, where `PRE_3347_MERGE_HEAD` is a frozen string holding the current `## Precondition` section through the start of `## Step 1` verbatim.
  - `test('AC1.2: task-prompt.md second-call template cites the rule via the merge bundle, not a restatement', …)`: slice `TASK_PROMPT` from `## Second call` to EOF and assert it contains `context/merge.md`'s "Never rewrite the integration branch"` with the fallback clause `(if that bundle is absent, read \`_shared/pr-first-merge.md\` directly)` on the same line. Also assert the second-call slice does **not** contain `force-push` (cited, not restated).

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/pr-first-merge.test.js`
Expected: FAIL (heading not found).

- [ ] **Step 3: Add the section and the citation.** `## Never rewrite the integration branch`, about 6-8 lines, makes four points. First, never force-push to, `reset`, `commit-tree`-and-push, or otherwise rewrite the published (`origin`) `{integration-branch}`, on any outcome and for any reason, including repairing a botched merge message. Second, why: the PR's recorded `mergeCommit`, merged-PR landed-proofs and release tooling key on the commit GitHub created, so a rewrite orphans them and re-authors the commit (PR #3325 → `9c9f5e722`, #3347). Third, what to do on a malformed merge message (stray text, duplicated body, missing `Fixes` line): leave the commit as landed, log `AUTO {time} — Step 3: merge commit {sha} message malformed ({defect}); left as landed, integration branch not rewritten. Reversibility: n/a.` to `decisions.md`, and report `DONE_WITH_CONCERNS` naming the sha and defect for a human. Fourth, scope: the rule covers the published branch, while `local-merge`'s undo of an unpushed local merge and a local ref realigned *to* origin (`_shared/git-discipline.md`) are not rewrites of it. In `task-prompt.md`'s second-call `pr-first` paragraph, add one sentence in the template's dispatcher-to-agent voice: ``Whatever the outcome, follow `{minted-run-dir}/context/merge.md`'s "Never rewrite the integration branch" section (if that bundle is absent, read `_shared/pr-first-merge.md` directly).``

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/pr-first-merge.test.js tests/dispatch-prompt-bundle-citations.test.js tests/bin-lib/skill-audit/context-cost.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/pr-first-merge.md plugin/skills/dispatch/task-prompt.md tests/pr-first-merge.test.js
git commit -m "Forbid rewriting the integration branch in pr-first merges — cited from the dispatch second-call template" -m "refs #3347"
```

### Task 4: Route the `Protected branch rules not configured` wording to Step 3 branch 1

**Files:**
- Modify: `plugin/skills/_shared/pr-first-merge.md` (Step 3 item 1, ~line 319-324)
- Test: `tests/pr-first-merge.test.js`

- [ ] **Step 1: Write the failing tests** in `tests/pr-first-merge.test.js`:
  - `function step3Items(step3Body)`: split Step 3's body (from `## Step 3: Attempt auto-merge` to `## Conflict path`) into items 1-5 by the `\n{N}. **Command` markers.
  - `function classifyStderr(stderr, items)`: return the 1-based index of the first item among 1-4 that has a backticked literal (`` /`([^`]+)`/g ``) that is a substring of `stderr`, else `5`.
  - `const PROTECTED = 'GraphQL: Pull request Protected branch rules not configured for this branch (enablePullRequestAutoMerge)';`
  - `test('AC3.1: the Protected-branch-rules stderr routes to Step 3 item 1 (auto-merge-not-enabled)', () => assert.equal(classifyStderr(PROTECTED, step3Items(step3Of(MERGE))), 1))`.
  - `test('AC3.1: the original #1411 capture still routes to item 1', …)` with `'GraphQL: Auto merge is not allowed for this repository (enablePullRequestAutoMerge)'`.
  - Go-red: `test('AC3.1 go-red: against the frozen pre-#3347 item 1 the Protected stderr falls to item 5', …)`. Build `items` from `step3Items(step3Of(MERGE))`, then replace `items[0]` with a frozen `PRE_3347_ITEM_1` string holding the current item 1 verbatim, and assert `classifyStderr(PROTECTED, items) === 5`.
  - `test('item 1 names the DIRTY re-check for the Protected wording', …)`: item 1 text matches `/mergeStateStatus/` and `/DIRTY/` and `/Conflict path/`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/pr-first-merge.test.js`
Expected: FAIL (classify returns 5).

- [ ] **Step 3: Extend item 1's signature text** with the literal `Protected branch rules not configured for this branch`, captured on this repo 2026-10-18 (`GraphQL: Pull request Protected branch rules not configured for this branch (enablePullRequestAutoMerge)` — `allow_auto_merge` on, no branch protection on `main`). Add one caveat sentence: GitHub returns the same wording for a conflicting PR, so on it re-read `mergeStateStatus` first and take the Conflict path when it reads `DIRTY`. Do not add any backticked literal to item 1 that could appear in an unrelated stderr (keep `classifyStderr` exact).

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/pr-first-merge.test.js tests/bin-lib/skill-audit/context-cost.test.js`
Expected: PASS (the pre-existing #1411 tests included).

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/pr-first-merge.md tests/pr-first-merge.test.js
git commit -m "Classify the Protected-branch-rules auto-merge rejection as Step 3 branch 1 — with a DIRTY re-check" -m "refs #3347"
```

## Spec coverage map

| Clause | Task / test |
|---|---|
| AC1.1 — rule in `_shared/pr-first-merge.md` | Task 3 `AC1.1` |
| AC1.2 — `task-prompt.md` second-call cites it | Task 3 `AC1.2` |
| AC1.3 — a conformance test asserts both | Task 3 (both tests) |
| AC2.1 — no merge fence evals `--shell` output | Task 2 `AC2.1/AC2.2` |
| AC2.2 — a sweep test asserts it | Task 2 `AC2.1/AC2.2` |
| AC3.1 — Protected stderr routes to branch 1 | Task 4 `AC3.1` |
| AC3.2 — a test with that literal stderr | Task 4 `AC3.1` (literal `PROTECTED`) |
