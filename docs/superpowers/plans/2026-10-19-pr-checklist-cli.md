# PR Phase-Checklist CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `plugin/bin/pr-checklist.js` call flips (or removes) a single phase row on a pr-first run's PR, replacing the hand-composed read/repair/flip/verify/write steps in `_shared/pr-checklist-refresh.md`.

**Architecture:** Pure body transforms live in a new `plugin/bin/lib/flow/pr-checklist.js` (row flip/remove inside the phases span, first-line run-id parse, and the run's premise-reversal reader moved out of `revise-pr-summary.js`). The CLI follows `plugin/bin/pr-checks.js`'s shape: `run(argv, overrides)` with every side effect on `deps`, `resolveTarget` anchoring, PR number from `run-state.json` via `readRunStateWithParent`, `gh pr view`/`gh pr edit --body-file -` through an injected `gh` seam. `repairPrBody` and `reviseSpecSummary` from `plugin/bin/lib/flow/pr-body.js` are reused unchanged.

**Tech Stack:** Node 18+ CommonJS, `node --test`, `gh` CLI.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T165101-record-3263/work/3263-spec.md`

Scope keywords: /tmp/pr-checklist-, readReversals, Locate the checklist span

Premise-refs: plugin/bin/pr-checks.js
Premise-refs: plugin/bin/revise-pr-summary.js
Premise-refs: plugin/bin/lib/flow/pr-body.js
Premise-refs: plugin/skills/_shared/pr-checklist-refresh.md

## Global Constraints

- CLI path: `plugin/bin/pr-checklist.js` (spec Deliverable 1 names `pr-checklist.js --run <dir> --phase <name> [--remove]`).
- Injectable-runner seam: exported `run(argv, overrides = {})`, `deps = { ...realDeps, ...overrides }`, entry guard `if (require.main === module) process.exitCode = run(process.argv.slice(2));` — never `process.exit` (`tests/bin-lib/exit-code-conformance.test.js`).
- Exit codes (header comment and `USAGE` both state them): 0 done or status-as-data (`no-pr`, `gh-absent`, `no-op`); 2 malformed invocation or unreadable `--summary-file`; 3 run dir missing or not anchored under the main checkout (same wording as `pr-checks.js`); 4 run-marker mismatch — refused, nothing written; 5 `gh pr view`/`gh pr edit` failed. 4 and 5 are distinct because `_shared/pr-checklist-refresh.md` branches on them (4: log the mismatch, never retry by hand; 5: best-effort warning, the next phase re-flips).
- Phase names: exactly `CANONICAL_PHASES` from `plugin/bin/lib/flow/pr-body.js` (`build`, `test`, `review`, `polish`, `wrap-up`).
- Byte ceiling: `_shared/pr-checklist-refresh.md` is composed into the `merge` bundle at `wrap-up/auto-merge-short-circuit.md:205` and `wrap-up/review-console.md:115`, which plan-audit measures at 50,181 of 51,200 bytes (1,019 headroom). Task 3's rewrite must leave the file no larger than its plan-time 13,861 bytes (`wc -c`); `tests/bin-lib/skill-audit/context-cost.test.js` is the gate.
- Every byte of the PR body outside the one edited row stays identical (AC1.1) — line-based edit, `\r` preserved, no re-join normalization.
- Commit style: `{Verb} {what} — {detail}`, body line `refs #3263` (never `closes`/`fixes`), trailer `Claude-Session: https://claude.ai/code/session_014jZCLvzHYqSD85nVGenWvD`.
- Scope and edit discipline: Commit tests only where the task asks for them or the repo already keeps tests for this kind of change, sized like the neighboring test files; scratch checks stay scratch. Touch only what the task requires — a pre-existing bug you notice is a follow-up to report, not a fix to fold in, unless the task cannot work without it. Don't reformat or "improve" adjacent code; edit in place rather than rewrite when the result is the same.

## Review Focus

1. **CRLF body** (a PR body edited in the GitHub web UI comes back `\r\n`) — the flip must match `- [ ] build\r` and keep the `\r`. Test in Task 1.
2. **Prefix-colliding row text** (`- [ ] test` vs a hand-added `- [ ] test-smoke` inside the span) — only the exact phase row changes. Test in Task 1.
3. **Plain-text-only markers** (a body last written through MCP's sanitized read carries only `[claude-tweaks-phases-start]`/`[claude-tweaks-phases-end]`) — the plain pair is used as the span. Test in Task 1.
4. **Foreign run marker on an already-checked row** — the mismatch refusal (exit 4) must win over the no-op shortcut, or a foreign body reads as "fine". Test in Task 2.
5. **Per-spec run dir** (`{parent}/spec-{N}/`, multi-spec) — run id is the parent's basename and the PR comes from the parent's `run-state.json`. Test in Task 2.

---

### Task 1: Pure checklist transforms in `lib/flow/pr-checklist.js`

**Files:**
- Create: `plugin/bin/lib/flow/pr-checklist.js`
- Modify: `plugin/bin/revise-pr-summary.js` (replace its private `readReversals` with the moved `readRunReversals`)
- Test: `tests/bin-lib/flow/pr-checklist.test.js`

**Interfaces:**
- Consumes: `CANONICAL_PHASES`, `parsePremiseReversals` from `plugin/bin/lib/flow/pr-body.js`; `readManifest` from `plugin/bin/lib/flow/manifest.js` (passed in via deps by callers).
- Produces:
  - `setPhaseRow({ body: string, phase: string, remove?: boolean }) -> { body: string, changed: boolean, row: 'checked' | 'removed' | 'already-checked' | 'row-absent' | 'no-phases-span' }`
  - `firstLineRunId(body: string) -> string | null`
  - `readRunReversals(runDir: string, deps: { readFile(p): string, readManifest(dir): object|null }) -> Array<{ original: string, replacement: string }>`

- [ ] **Step 1: Write the failing tests** in `tests/bin-lib/flow/pr-checklist.test.js`. Fixture body = `composePrEarlyBody({ runId: 'R1', specSummary: 'S', target: '#1', nextStep: 'build', fixesLines: ['Fixes #1'] })`. Tests:
  - `AC1.1: flipping build changes only that row` — `setPhaseRow({ body, phase: 'build' })` returns `changed: true`, `row: 'checked'`, and `out.body === body.replace('- [ ] build', '- [x] build')`.
  - `AC1.1: --remove deletes only that row's line` — `phase: 'polish', remove: true` → `out.body === body.replace('- [ ] polish\n', '')`, `row: 'removed'`.
  - `already-checked row is a no-op` — flip `build` twice; second call `changed: false`, `row: 'already-checked'`, body identical.
  - `removing an absent row is a no-op` — remove `polish` twice; second `row: 'row-absent'`, `changed: false`.
  - `flipping an absent row is a no-op` — after removing `polish`, flip `polish` → `row: 'row-absent'`.
  - `CRLF body keeps its carriage returns` — `crlf = body.replace(/\n/g, '\r\n')`; flip `build` → `out.body === crlf.replace('- [ ] build\r', '- [x] build\r')`.
  - `exact phase match only` — insert `- [ ] test-smoke` after `- [ ] test`; flip `test` → `test-smoke` row still `- [ ] test-smoke`.
  - `rows outside the span are untouched` — append `\n- [ ] build\n` after the body; flip `build` → the trailing row stays unchecked, the span row is checked.
  - `plain-text-only span is used` — strip the two `<!-- phases-* -->` lines; flip `build` → `row: 'checked'`.
  - `no phases span reports no-phases-span` — body `'hello\n'` → `{ changed: false, row: 'no-phases-span', body: 'hello\n' }`.
  - `unknown phase throws` — `assert.throws(() => setPhaseRow({ body, phase: 'deploy' }), /unknown phase/)`.
  - `firstLineRunId reads either marker form` — `firstLineRunId(body) === 'R1'`; `firstLineRunId('claude-tweaks-run: R2\nx') === 'R2'`; `firstLineRunId('<!-- claude-tweaks-run: R3 -->\r\nx') === 'R3'`; `firstLineRunId('text\n<!-- claude-tweaks-run: R1 -->') === null`.
  - `readRunReversals reads a bundle's per-spec decisions.md files` — temp dir with `manifest.yml` read via a fake `readManifest` returning `{ multispec: { specs: [{ id: 1 }, { id: 2 }] } }` and fake `readFile` returning a canonical `- AUTO 10:00:00 — /build: premise reversed: A → B. Reversibility: n/a.` line for `spec-2/decisions.md` only → `[{ original: 'A', replacement: 'B' }]`; with `readManifest` returning `null` it reads `{runDir}/decisions.md`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/flow/pr-checklist.test.js`
Expected: FAIL with `Cannot find module '../../../plugin/bin/lib/flow/pr-checklist'`

- [ ] **Step 3: Implement the three functions** in `plugin/bin/lib/flow/pr-checklist.js`. Span: if both `<!-- phases-start -->` and `<!-- phases-end -->` lines exist use the first start line through the next end line; else the `[claude-tweaks-phases-start]`/`[claude-tweaks-phases-end]` pair; else `no-phases-span`. Work on `body.split('\n')`; a row matches when `line.replace(/\r$/, '').trim()` is `- [ ] {phase}` or `- [x] {phase}` / `- [X] {phase}`. Flip replaces the first `- [ ]` occurrence in the line (leading whitespace and `\r` kept); remove splices the line out. Every matching row in the span is edited. Rejoin with `'\n'`. `readRunReversals` is `revise-pr-summary.js`'s `readReversals` moved verbatim (same fail-open read). Then in `plugin/bin/revise-pr-summary.js` delete `readReversals` and call `readRunReversals(o.runDir, deps)`; keep its `require` of `path` only if still used.

- [ ] **Step 4: Run the new suite and the moved function's existing suite**

Run: `node --test tests/bin-lib/flow/pr-checklist.test.js tests/revise-pr-summary-cli.test.js tests/bin-lib/flow/pr-body.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/flow/pr-checklist.js plugin/bin/revise-pr-summary.js tests/bin-lib/flow/pr-checklist.test.js
git commit -m "Add pr-checklist body transforms — row flip/remove, run-id parse, shared reversal reader" -m "refs #3263"
```

### Task 2: `plugin/bin/pr-checklist.js` CLI

**Files:**
- Create: `plugin/bin/pr-checklist.js`
- Test: `tests/bin-lib/flow/pr-checklist-cli.test.js`

**Interfaces:**
- Consumes: Task 1's `setPhaseRow`, `firstLineRunId`, `readRunReversals`; `repairPrBody`, `reviseSpecSummary`, `CANONICAL_PHASES` (`lib/flow/pr-body.js`); `resolveTarget`, `appendEntry`, `formatEntry` (`lib/log-decision/append.js`); `readRunStateWithParent` (`lib/hooks/context.js`); `ghAvailable` (`lib/repo-resolve.js`); `GH_TIMEOUT_MS` (`lib/shared-primitives.js`); `readManifest` (`lib/flow/manifest.js`).
- Produces: `node plugin/bin/pr-checklist.js --run <run-dir> --phase <build|test|review|polish|wrap-up> [--remove] [--fixes <n>[,<m>...]] [--summary-file <file>] [--help]`; exports `{ run, parseArgs }`. stdout is one JSON line `{ action, pr, phase, row, restored, summary: { uncovered, reason, changed } }` where `action` is `written | no-op | no-pr | gh-absent`.
- `deps` seams: `cwd`, `mainRoot`, `ghAvailable()`, `gh(args, input?) -> string` (`execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe','pipe','pipe'], timeout: GH_TIMEOUT_MS, windowsHide: true })`), `readRunState(runDir) -> { state, parentRunDir }`, `readFile`, `readManifest`, `appendDecision({ runDir, entry })`, `now()`, `stdout`, `stderr`.

Procedure the CLI implements, in this order (the order is the contract — Review Focus 4):
1. Parse/validate: `--run` and `--phase` required, `--phase` in `CANONICAL_PHASES`, value flags reject a missing or `--`-prefixed value, `--fixes` positive integers → else exit 2. `--help` prints `USAGE`, exit 0, before any probe.
2. `resolveTarget({ runDir, cwd, mainRoot })` not ok → exit 3 (stderr wording copied from `pr-checks.js`).
3. `readRunStateWithParent(run, { requireRunIdParent: true })`; `runId = basename(parentRunDir || run)`; no positive integer `state.pr.number` → print `{ action: 'no-pr' }`, exit 0.
4. `!ghAvailable()` → print `{ action: 'gh-absent', pr }`, exit 0.
5. Read `--summary-file` when given (failure → exit 2).
6. `gh pr view {n} --json body` → `JSON.parse(...).body`; throw → stderr cause, exit 5.
7. `repairPrBody({ body, runId, fixesLines: fixes.map(n => 'Fixes #' + n) })`, then `setPhaseRow`, then `reviseSpecSummary({ body, reversals: readRunReversals(parentRunDir || run, deps), summary })` (apply its `body` only when `changed`).
8. `firstLineRunId(final) !== runId` → stderr `run marker mismatch on PR #{n}: body names run {found}, expected {runId} — nothing written`, exit 4.
9. `final === original read body` → print `action: 'no-op'`, exit 0, no `gh pr edit`.
10. `gh pr edit {n} --body-file -` with `final` as stdin; throw → exit 5.
11. When `restored` is non-empty, best-effort `appendDecision` of `formatEntry({ status: 'AUTO', now, step: 'PR checklist refresh', text: 'restored {restored.join(', ')} on PR #{n} (body carried none/some of the expected markers)', reversibility: 'high' })`; a throw is swallowed into the envelope as `logFailed: true`, never an exit change.
12. Print `action: 'written'`, exit 0.

- [ ] **Step 1: Write the failing tests** in `tests/bin-lib/flow/pr-checklist-cli.test.js`, reusing `tests/bin-lib/pr-checks/cli.test.js`'s fake-`.git` anchored fixture (`mainRoot` injected) with run id `2026-10-19T000001-record-1`, `run-state.json` `{ pr: { number: 7 } }`, and a fake `gh` that serves `pr view` from a mutable `prBody` (initially `composePrEarlyBody` for that run id) and records `pr edit` args + input. Tests:
  - `AC1.1: one call flips build and writes a body identical except that row` — exit 0; exactly one `pr edit` call with args `['pr','edit','7','--body-file','-']`; written input `=== prBody.replace('- [ ] build', '- [x] build')`; envelope `{ action: 'written', row: 'checked', restored: [] }`.
  - `AC1.1: --remove drops the polish row only` — written input `=== prBody.replace('- [ ] polish\n', '')`, `row: 'removed'`.
  - `already-checked row is a no-op with no write` — `prBody` has `- [x] build`; exit 0, `action: 'no-op'`, zero `pr edit` calls.
  - `missing markers are repaired and logged` — `prBody = 'Hand-written body\n'`; exit 0; written input starts with `<!-- claude-tweaks-run: 2026-10-19T000001-record-1 -->`, contains `- [x] build` and, with `--fixes 1`, `Fixes #1`; `decisions.md` in the run dir contains `restored run marker, phases block, fixes block on PR #7`.
  - `AC2.1: a body naming a different run id is refused and nothing is written` — `prBody` composed for run id `2026-01-01T000000-record-9`; exit 4; zero `pr edit` calls; stderr matches `/run marker mismatch/`.
  - `AC2.1: the mismatch wins over an already-checked row` — foreign run id and `- [x] build`; exit 4, zero writes.
  - `per-spec run dir uses the parent run id and PR` — fixture with `spec: true` (pr-checks' shape); exit 0, written.
  - `no pr in run-state is status data` — `run-state.json` `{}`; exit 0, `action: 'no-pr'`, zero gh calls.
  - `gh absent is status data` — `ghAvailable: () => false`; exit 0, `action: 'gh-absent'`.
  - `gh pr edit failure exits 5` — fake throws on `pr edit`; exit 5.
  - `premise reversal without --summary-file reports uncovered and writes checklist-only` — `decisions.md` holds a canonical `premise reversed: A → B` line; exit 0, `summary.uncovered` `['A → B']`, `summary.reason: 'summary-required'`, written body has no `Revised during build:`.
  - `--summary-file applies the Spec summary revision in the same write` — exit 0, written body contains `Revised during build: A → B`, `summary.changed: true`.
  - `malformed invocations exit 2` — no `--phase`; `--phase deploy`; trailing bare `--run`; `--fixes 0`.
  - `unanchored run dir exits 3` — run dir outside `mainRoot`'s pipelines path with a worktree-shaped `.git` file (copy pr-checks' unanchored case).
  - `--help exits 0 without touching gh`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/flow/pr-checklist-cli.test.js`
Expected: FAIL with `Cannot find module '../../../plugin/bin/pr-checklist'`

- [ ] **Step 3: Implement `plugin/bin/pr-checklist.js`** per the procedure above; header comment states usage, the five exit codes and why 4/5 are distinct, and that `_shared/pr-checklist-refresh.md`'s Phase-checklist update is the calling procedure.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/flow/pr-checklist-cli.test.js tests/bin-lib/flow/pr-checklist.test.js tests/bin-lib/exit-code-conformance.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/pr-checklist.js tests/bin-lib/flow/pr-checklist-cli.test.js
git commit -m "Add pr-checklist.js — one call flips or removes a PR phase row" -m "refs #3263"
```

### Task 3: Point `_shared/pr-checklist-refresh.md` at the CLI

**Files:**
- Modify: `plugin/skills/_shared/pr-checklist-refresh.md` (the `- **Set**:` bullet of `## Phase-checklist update (every phase exit)`, lines 35-95 at plan time)
- Modify: `tests/premise-reversal-spec-summary-3050.test.js` (re-point the Refresh/ordering pins — see Step 1)
- Modify: `tests/pr-early-run-lifecycle.test.js` (add the #3263 pins; keep the #2997 pins green)
- Modify: `docs/plugin-structure.md` (CLI line after the `revise-pr-summary.js` line, ~163; `plugin/bin/lib/flow/` line ~48 names `pr-checklist.js`)

**Interfaces:**
- Consumes: Task 2's CLI invocation shape and exit codes.
- Produces: nothing code-facing.

Pins on the prose this task rewrites (moved-prose pin check, `git grep -n -F` over `tests plugin docs .claude/skills` for `Repair before locating anything`, `Flip that phase`, `/tmp/pr-checklist-`, `Re-read that file's first line`, `Refresh the Spec summary after a premise`, `Compose-then-write-once`, `revise-pr-summary`):
- `tests/pr-early-run-lifecycle.test.js:306-309` — `/Repair before locating anything \(#2997\)/` and `/This replaces the former best-effort skip on a\s*\n\s*missing delimiter pair/` (line-break sensitive).
- `tests/premise-reversal-spec-summary-3050.test.js:72-93` — `section(update, '**Refresh the Spec summary after a premise reversal (#3050).**', 'Compose-then-write-once')` with ten pins, and the ordering test requiring that paragraph to precede `gh pr edit {number} --repo`.
- `docs/journeys/read-an-accurate-spec-summary-after-a-premise-reversal-3050.md:27-28` describe the temp-file order — not a test; left for Common Step 6 journeys.

New `- **Set**:` bullet shape:
1. **`gh` present** — one call: `node "${CLAUDE_PLUGIN_ROOT}/bin/pr-checklist.js" --run "{run-dir}" --phase {phase} --fixes {n}[,{m}...]` (`--remove` for a skipped phase's row at its would-be exit). One sentence naming what it does: reads `run-state.json`'s `pr`, runs `repairPrBody` and logs what it restored, flips or removes the one row inside the phases span, runs the Spec-summary check, verifies the first line names this run, writes back with `gh pr edit --body-file -`. Exit-code branch list: 0 by `action` (`written`/`no-op` done; `no-pr` → the degraded-run recovery above; `gh-absent` → the MCP path below); 4 → log `AUTO {time} — PR checklist refresh: refused on PR #{number} — run marker mismatch ({stderr}). Reversibility: n/a.` and do not edit the body by hand; 5 → best-effort warning per the existing "Best-effort" paragraph; 2/3 → a bad call, fix and re-run.
2. **Spec summary after a premise reversal (#3050)** — keep the `**Refresh the Spec summary after a premise reversal (#3050).**` heading and its ten pinned phrases, rewritten for the CLI: non-empty `summary.uncovered` in the envelope → write the one-paragraph summary (`bin/session-tmp-resolve.js`, Write tool, this run's diff, nothing it does not show) and re-run the same call with `--summary-file {file}`; the already-checked row makes the second call's flip a no-op. The `gh`-absent path still runs `bin/revise-pr-summary.js` (keep that citation).
3. **`gh` absent (MCP)** — the existing steps, condensed, cited to `_shared/github-write-transport.md`'s Detection rule: `mcp__github__pull_request_read` (`get`), the existing **Repair before locating anything (#2997).** paragraph kept with its `This replaces the former best-effort skip on a` / `missing delimiter pair` line break intact, locate the `[claude-tweaks-phases-start]` pair, flip, `revise-pr-summary.js` with `--body-file`, first-line run-id check, then the existing `<!-- when: transport=mcp -->` `mcp__github__update_pull_request` fence unchanged.
4. Keep "Compose-then-write-once" as the MCP path's closing sentence (it terminates the 3050 `section()` pin) and the following "Best-effort", "Multi-spec runs share one PR", and "Premise-reversal decisions (#3050)" paragraphs unchanged.

- [ ] **Step 1: Write the failing pins** in `tests/pr-early-run-lifecycle.test.js`:
  - `AC3.1: the Phase-checklist update cites bin/pr-checklist.js` — the `## Phase-checklist update (every phase exit)` section matches `/bin\/pr-checklist\.js" --run "\{run-dir\}" --phase \{phase\}/` and `/--remove/`.
  - `AC3.2: the gh-present path carries no hand-composed six-step prose` — the text between the CLI call and the `gh`-absent heading does not match `/\/tmp\/pr-checklist-/`, `/gh pr edit \{number\} --repo/`, or `/Locate the checklist span/`; and the whole section no longer matches `/\/tmp\/pr-checklist-/` (the MCP path writes no temp file).
  - Go-red control: factor the two AC3 assertions into `assertCliCited(text)` and `assertNoHandSteps(text)`; both AC3 tests call them on the live section, and a third test calls each on a frozen string constant `PRE_3263` holding today's lines 49-60 and 84-86 of the file (the locate/flip/temp-file/`gh pr edit` prose) and asserts each call throws — the same frozen-excerpt style as `PRE_REFRESH` in the 3050 test.
  In `tests/premise-reversal-spec-summary-3050.test.js`, change the ordering test (`the Refresh paragraph precedes the gh pr edit invocation it feeds (M1)`) to require the Refresh paragraph to precede `mcp__github__update_pull_request`, and add `assert.match(step, /--summary-file/)` and `assert.match(step, /bin\/pr-checklist\.js/)` to the trigger test. Leave `PRE_REFRESH` and the go-red test unchanged.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/pr-early-run-lifecycle.test.js tests/premise-reversal-spec-summary-3050.test.js`
Expected: FAIL — the two new AC3 tests and the edited ordering/trigger tests fail; every other test in both files passes.

- [ ] **Step 3: Rewrite the `- **Set**:` bullet** to the shape above and add the two `docs/plugin-structure.md` lines (CLI line: usage, the JSON envelope, exit 0/2/3/4/5, "Called by `plugin/skills/_shared/pr-checklist-refresh.md`'s Phase-checklist update", tests in `tests/bin-lib/flow/pr-checklist*.test.js`).

- [ ] **Step 4: Run every suite that reads the file**

Run: `node --test tests/pr-early-run-lifecycle.test.js tests/premise-reversal-spec-summary-3050.test.js tests/merge-verification-gate-conformance.test.js tests/bundle-fixes-reconciliation-2015.test.js tests/deferred-closure-fixes-2686.test.js tests/bin-lib/skill-audit/context-cost.test.js tests/ceremony-profile-roster.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/pr-checklist-refresh.md tests/pr-early-run-lifecycle.test.js tests/premise-reversal-spec-summary-3050.test.js docs/plugin-structure.md
git commit -m "Point the Phase-checklist update at pr-checklist.js — gh path is one call, MCP path kept" -m "refs #3263"
```

## Real-input probe

At build's own phase exit (Common Step 7), run the worktree's CLI against this run's real PR instead of hand-flipping: `node plugin/bin/pr-checklist.js --run "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-10-19T165101-record-3263" --phase build --fixes 3263`. Expected: exit 0, `action: written`, `row: checked`; independent check: `gh pr view 3611 --json body -q .body | grep -c '^- \[x\] build$'` prints `1` and `diff` of the before/after bodies shows exactly one changed line.

## Spec coverage map

| Spec item | Task |
|---|---|
| Deliverable 1 (CLI, run-state PR, repair, flip/remove, run-marker verify, write back, runner seam) | Tasks 1-2 |
| Deliverable 2 (refresh doc cites CLI, MCP path kept) | Task 3 |
| Deliverable 3 (tests: flip, remove, already-checked, missing-markers repair, marker mismatch) | Tasks 1-2 |
| AC1.1 | Task 1 `AC1.1:` tests, Task 2 `AC1.1:` tests |
| AC2.1 | Task 2 `AC2.1:` tests |
| AC3.1 | Task 3 `AC3.1:` test |
| AC3.2 | Task 3 `AC3.2:` test |
