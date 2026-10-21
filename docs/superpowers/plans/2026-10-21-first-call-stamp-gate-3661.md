# First-Call Stamp Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The two-call gate reads the first call's runner-written pass stamp (`verify.js --stamp-status` → `verifiedHead`) before dispatching call 2, applies a documented posture when no stamp verifies HEAD, and the first-call template stops accepting a raw `npm test` log as its self-check artifact.

**Architecture:** A new exported function, `checkFirstCallStamp({ runDir }, deps)`, sits beside `checkFirstCallArtifacts` in `plugin/bin/lib/dispatch/first-call-artifact-check.js`. It reads `run-state.json`'s `worktree`, runs `verify.js --stamp-status` with that worktree as cwd (the stamp lives under the worktree's own git dir, and `stampStatus()` reads HEAD/dirty from the invoking cwd), and confirms `report.json` exists at the stamp's `reportPath`. It never fails the gate. The chosen posture is **note**: dispatch call 2 unchanged and log one `SKIP` line. Blocking would throw away a build that call 2's review Step 1.5 re-verifies through the runner anyway. Repairing would re-run the suite in the dispatching session, which moves the cost without saving it. `checkFirstCallArtifacts`'s return shape is unchanged, so its nine `deepEqual(result, { ok: true })` tests and `resolveFirstCallGate` stay as they are (return-shape widening check: no widening). The prose lands in `two-call-gate.md` §2 (the posture and its log line), `sequential-execution.md` (one mirroring sentence), and `task-prompt.md`'s first-call CRITICAL paragraph (the stamp plus `report.json` is the only artifact).

**Tech Stack:** Node 18+ CommonJS, `node --test`, Markdown skill prose.

**Spec:** `.claude-tweaks/pipelines/2026-10-21T154211-record-3661/work/3661-spec.md` (record #3661)

## Global Constraints

- Commit messages: `{Verb} {what} — {detail}`, referencing the record as `refs #3661`, never `closes`/`fixes`.
- Every `execFileSync` in `plugin/bin/` passes `windowsHide: true` (bin-source-scan conformance suite); spawn Node as `process.execPath`, never a bare `node`.
- `checkFirstCallArtifacts`'s existing return shape and `resolveFirstCallGate`'s behavior are unchanged.
- Byte headroom against `RAIL_BYTES` (52,500 B): `task-prompt.md` 44,996 B (7,504 B headroom; this edit is roughly byte-neutral), `two-call-gate.md` 16,614 B, `sequential-execution.md` 15,910 B.
- Skill references in actionable text use the fully qualified `/claude-tweaks:{skill}` form.

## Review Focus

1. **A dirty worktree, or one whose HEAD moved after the stamp:** `verify.js` reports `present: true, verifiedHead: false`. This must read as `stamp-not-head`, not as `stamp-absent`. Task 1 pins it.
2. **`verify.js` cannot run** (spawn error, non-JSON stdout, timeout): this must yield `stamp-read-failed` and never throw out of the gate. A broken read must never block a dispatch, and it must never be mistaken for "no stamp". Task 1 pins it.
3. **`run-state.json` missing, unparseable, or without a `worktree` field:** `stampStatus` is never invoked, because a cwd-less read would inspect the dispatching session's own checkout. Task 1 pins it with a stub that throws if called.
4. **The stamp verifies HEAD but `report.json` is gone** (log dir cleaned): this reads as `report-missing`. The stamp plus its report is the artifact (Deliverable 2), so a stamp alone is not enough. Task 1 pins it.
5. **The first-call CRITICAL paragraph still satisfies `tests/dispatch-rederive-from-artifacts-conformance.test.js`:** the `CRITICAL_LINE` regex, the `report.json` reference, and the "own claim against the artifact you just produced" framing must all still match. Task 2 runs that suite unchanged.

---

### Task 1: `checkFirstCallStamp` — the stamp-at-HEAD read

**Files:**
- Modify: `plugin/bin/lib/dispatch/first-call-artifact-check.js` (new function + export; header comment line naming #3661)
- Test: `tests/bin-lib/dispatch/first-call-artifact-check.test.js` (append)

**Interfaces:**
- Consumes: `run-state.json`'s `worktree` field (written by `hooks.js record-worktree`); `verify.js --stamp-status`'s JSON line `{present, sha, head, dirty, scope, fullSha, match, verifiedHead, baselineAdjudicated, preExistingAdjudicated, reportPath, legacy}` (exit 0 always, `plugin/bin/verify.js` `stampStatus()`).
- Produces: `checkFirstCallStamp({ runDir }, deps?) -> { verified: boolean, reason: null | 'worktree-unrecorded' | 'stamp-read-failed' | 'stamp-absent' | 'stamp-not-head' | 'report-missing', status: object | null }`. `deps`: `readFile(path) -> string` (default `defaultReadFile`), `stampStatus(worktree) -> object` (default: `execFileSync(process.execPath, [<plugin>/bin/verify.js, '--stamp-status'], { cwd: worktree, encoding: 'utf8', timeout: GH_TIMEOUT_MS, windowsHide: true })` then `JSON.parse`; may throw), `exists(path) -> boolean` (default `fs.existsSync`). `verified` is `true` only when `status.verifiedHead === true` and `exists(status.reportPath)`. `status` is the parsed stamp-status object whenever one was read, else `null`.

- [ ] **Step 1: Write the failing tests** — append to `tests/bin-lib/dispatch/first-call-artifact-check.test.js`. Write `run-state.json` via the file's existing `writeRunDir` helper and inject `stampStatus` / `exists` stubs. Never spawn the real `verify.js` here:
  - `AC2.1: a stamp verifying HEAD with its report.json present passes unchanged`: `runState: { worktree: '/wt' }`, stub returning `{ present: true, verifiedHead: true, reportPath: '/wt/.git/claude-tweaks-verify/report.json' }`, `exists` true for that path → `deepEqual(result, { verified: true, reason: null, status: <that object> })`, and the stub was called exactly once with `'/wt'`.
  - `AC1.1: no stamp at all (raw npm test first call) is detected as stamp-absent`: stub `{ present: false, verifiedHead: false, reportPath: null }` → `verified: false, reason: 'stamp-absent'`.
  - `AC1.1: a stamp that does not verify HEAD is stamp-not-head`: stub `{ present: true, verifiedHead: false, reportPath: '/r.json' }` → `reason: 'stamp-not-head'`.
  - `report.json missing behind a verifying stamp is report-missing`: stub `verifiedHead: true`, `exists` returns false → `reason: 'report-missing'`, `verified: false`.
  - `no worktree recorded never reads a stamp`: `runState: {}` (and a second case with no `run-state.json` at all) with a stub that throws if called → `reason: 'worktree-unrecorded', status: null`.
  - `an unreadable stamp read is stamp-read-failed, never a throw`: a stub that throws (and a second case returning a non-object such as `null`) → `reason: 'stamp-read-failed', status: null`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/dispatch/first-call-artifact-check.test.js`
Expected: FAIL — `checkFirstCallStamp is not a function` on the new tests; the existing tests still pass.

- [ ] **Step 3: Implement `checkFirstCallStamp({ runDir }, deps)` in `plugin/bin/lib/dispatch/first-call-artifact-check.js`** per the Interfaces block. Resolve `VERIFY_JS` as `path.resolve(__dirname, '..', '..', 'verify.js')`. Check in the reason order listed, first match wins. Put a comment above the function stating the note posture and why: never a gate result, because call 2's review Step 1.5 re-verifies an unstamped HEAD through the runner. Export it alongside the existing names. Leave `checkFirstCallArtifacts` untouched.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/dispatch/first-call-artifact-check.test.js`
Expected: PASS, `# fail 0`.

- [ ] **Step 5: Real-input probe.** Run the default (unstubbed) path once against this run's real directory and record the printed object in the commit body. Expect `reason: 'stamp-absent'` before this build's own verification has run; after Common Step 5, the same probe must print `verified: true`.

Run: `node -e "console.log(JSON.stringify(require('./plugin/bin/lib/dispatch/first-call-artifact-check.js').checkFirstCallStamp({ runDir: '/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-10-21T154211-record-3661' })))"`
Expected: a JSON object carrying `"reason":"stamp-absent"` (and a non-null `status` whose `head` equals this worktree's `git rev-parse HEAD`).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/dispatch/first-call-artifact-check.js tests/bin-lib/dispatch/first-call-artifact-check.test.js
git commit -m "Add checkFirstCallStamp — two-call gate reads the first call's verify.js pass stamp (refs #3661)"
```

### Task 2: Gate posture and first-call artifact prose

**Files:**
- Modify: `plugin/skills/dispatch/two-call-gate.md` (§2 — one new paragraph after "Artifact check, gated alongside STATUS/OUTCOME", before "Repair branch")
- Modify: `plugin/skills/dispatch/sequential-execution.md` ("Artifact check, first call only" paragraph — one sentence before its final sentence)
- Modify: `plugin/skills/dispatch/task-prompt.md` (first-call template's CRITICAL paragraph, currently lines 216-222)
- Modify: `docs/skill-graph.md` (one row in the `/dispatch` table, after the `first-call-artifact-check.js`'s `repairable` field row)
- Test: `tests/dispatch-mechanical-enforcement.test.js` (append), `tests/dispatch-rederive-from-artifacts-conformance.test.js` (append)

**Interfaces:**
- Consumes: Task 1's `checkFirstCallStamp` and its reason vocabulary.
- Produces: the logged line shape `SKIP {time} — Artifact check (stamp): condition: no runner pass stamp verifies the first call's HEAD ({reason}) -> fallback: call 2 dispatched unchanged; its review Step 1.5 re-verifies through the runner (#3661). Reversibility: n/a.`, written via `log-decision.js --status SKIP --step "Artifact check (stamp)" --text "condition: no runner pass stamp verifies the first call's HEAD ({reason}) -> fallback: call 2 dispatched unchanged; its review Step 1.5 re-verifies through the runner (#3661)" --reversibility n/a`.

- [ ] **Step 1: Write the failing tests.**
  - In `tests/dispatch-mechanical-enforcement.test.js`, add `function assertStampNote(gate)` asserting on the §2 text (sliced from `## 2. The gate` to `## 5.`): it matches `/checkFirstCallStamp\(\{ runDir \}\)/`, `/verify\.js --stamp-status/`, `/verifiedHead/`, the literal `--status SKIP --step "Artifact check (stamp)"`, `/call 2 dispatched unchanged/`, `/#3661/`, and the posture rationale words `/never a gate/`. The stamp paragraph's index must be after the `Artifact check, gated alongside STATUS/OUTCOME` heading's index (it runs only once the artifact check returned `{ ok: true }`). Add:
    - `AC1.1: two-call-gate.md §2 reads the first call's stamp before call 2 and logs the note posture` → `assertStampNote(read('plugin/skills/dispatch/two-call-gate.md'))`.
    - `AC2.1: a verifying stamp logs nothing and changes nothing` → §2 matches `/`verified: true`[\s\S]{0,200}?logs nothing/` (the parenthetical between them contains `report.json`, so never `[^.]*`).
    - `sequential-execution.md mirrors the stamp note` → matches `/checkFirstCallStamp/` and `/never a gate/`.
    - `go-red control: assertStampNote fails on §2 with the stamp paragraph removed` → build the mutated text by dropping the paragraph containing `checkFirstCallStamp`, then `assert.throws(() => assertStampNote(mutated))`.
  - In `tests/dispatch-rederive-from-artifacts-conformance.test.js`, add `function assertFirstCallStampArtifact(firstCallBlock)`: the CRITICAL paragraph (from `CRITICAL:` to the next blank line) matches `/verifiedHead: true/`, `/report\.json/`, `/\/claude-tweaks:test/`, and `/#3661/`, and does NOT match `/test-output log this call's own `npm test` run wrote/`. Add the test `Deliverable 2: first call's CRITICAL artifact is the runner stamp plus report.json, never a raw npm test log`, and a go-red control that re-inserts the old sentence `The actual artifact is the test-output log this call's own \`npm test\` run wrote, or a` into the paragraph and expects `assertFirstCallStampArtifact` to throw. Find the first-call block the same way the existing test at line 51 does.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/dispatch-mechanical-enforcement.test.js tests/dispatch-rederive-from-artifacts-conformance.test.js`
Expected: FAIL — the new AC1.1 / Deliverable 2 tests (`checkFirstCallStamp` absent from §2; the old raw-log sentence still present).

- [ ] **Step 3: Write the prose.**
  - `two-call-gate.md` §2, new paragraph, headed in bold `**Stamp read, a note never a gate (#3661).**`. It says: once `checkFirstCallArtifacts` returns `{ ok: true }`, run `checkFirstCallStamp({ runDir })` from the same module. It reads `run-state.json`'s `worktree` and runs `verify.js --stamp-status` there. `verified: true` (a stamp whose `verifiedHead` is true and whose `report.json` exists) logs nothing and changes nothing. Any other result means the first call's test phase bypassed `/claude-tweaks:test`: log the Interfaces line via `log-decision.js` and dispatch call 2 unchanged. Add one sentence of rationale: blocking would discard a build that call 2's review Step 1.5 re-verifies through the runner anyway, and repairing would re-run the suite here, moving that cost rather than saving it. A `stamp-read-failed` result takes the same note and is never treated as a failed artifact check.
  - `sequential-execution.md`: one sentence: "After a clean artifact check, `two-call-gate.md` section 2's stamp read (`checkFirstCallStamp`, #3661) runs too; its result is a note never a gate, logged once as a `SKIP` when no runner stamp verifies HEAD."
  - `task-prompt.md` first-call CRITICAL paragraph. Keep its first three lines verbatim (through "only your own freshly written result."). Replace the rest with: the actual artifact is the runner-written pass stamp verifying HEAD (`verify.js --stamp-status` reports `verifiedHead: true`) and its `report.json`, which exist only when the test phase runs through `/claude-tweaks:test`; a raw `npm test` log is not that artifact, because it leaves no stamp and the second call then re-runs the full suite (#3661); never report a result from narrative or memory of an earlier pass in this same call; if the stamp is absent or does not verify HEAD, re-run the test phase through `/claude-tweaks:test` before reporting. Keep the wrapped line width of the surrounding paragraph. Prohibition-vs-mandate reconciliation: the template's "Foreground execution (required): run `npm test` …" clause governs *how* a long command runs (in the foreground), not which artifact counts, and `/claude-tweaks:test`'s runner invokes the same suite. It stays unchanged, and the new CRITICAL sentence is the reconciling statement.
  - `docs/skill-graph.md`: a new row after the `repairable` row. Column 1 is ``bin/verify.js --stamp-status` (`first-call-artifact-check.js`'s `checkFirstCallStamp`)``. Column 2 says: `two-call-gate.md` §2's stamp read (#3661) reads the first call's `verifiedHead` and `reportPath` from the runner's own JSON, run in the group worktree. A rename of either field, or of the stamp's git-dir location, must update `checkFirstCallStamp` and `tests/bin-lib/dispatch/first-call-artifact-check.test.js`. The read is a note, never a gate, because `/review` Step 1.5 re-verifies an unstamped HEAD.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/dispatch-mechanical-enforcement.test.js tests/dispatch-rederive-from-artifacts-conformance.test.js tests/foreground-execution-instruction.test.js tests/subagent-contract-clauses.test.js tests/dispatch-prompt-bundle-citations.test.js`
Expected: PASS, `# fail 0`. Then `wc -c plugin/skills/dispatch/task-prompt.md` must print a value below 52500.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/dispatch/two-call-gate.md plugin/skills/dispatch/sequential-execution.md plugin/skills/dispatch/task-prompt.md docs/skill-graph.md tests/dispatch-mechanical-enforcement.test.js tests/dispatch-rederive-from-artifacts-conformance.test.js
git commit -m "Gate call 2 on the first call's runner stamp as a note — drop the raw npm test log as the first call's artifact (refs #3661)"
```

## Build deviations (Common Step 4.5, classified Beneficial)

1. **First-call stopping rule.** The spec dropped the raw-log alternative but set no bound on re-running. As built, `task-prompt.md` re-runs `/claude-tweaks:test` once, then reports `STATUS: DONE_WITH_CONCERNS` naming the stamp state. This keeps call 1 from turning the note into a gate (a dirty tree never verifies). From the whole-branch review's Important 3, fixed in 386fd2381.
2. **The stamp read covers the repair branch.** The plan ran it only after `{ ok: true }`. As built, it runs before every call-2 dispatch, including the `missing-config`/`repairable` repair branch, so AC1's detection covers every path that dispatches call 2 (386fd2381).
3. **The report check is file-only.** The plan used `fs.existsSync`. As built, the check is path-guard `lstatType(...).type === 'file'`, so a directory named `report.json` is not the artifact. This also satisfies `tests/path-guard-conformance.test.js` (991016f42).
4. **Timeout.** The plan used `GH_TIMEOUT_MS`. As built, the local node+git spawn uses `GIT_TIMEOUT_MS` (991016f42).
