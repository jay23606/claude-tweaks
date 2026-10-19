# Windows regression: 2 test file(s) newly failing after a39cd61fa (#3429) Implementation Plan

**Goal:** Fix the two test files added by #3348 that fail only on Windows checkouts — a CRLF-sensitive raw markdown read and a chmod-based permission simulation that cannot deny reads on win32 — with no change to plugin behavior.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T042428-record-3429/work/3429-spec.md` (materialized from GitHub issue #3429)

---

### Task 1: Route REVIEW markdown reads through readText() and add a win32 skip to the chmod-based permission tests

**Files:**
- Test: `tests/load-delta-cli.test.js`
- Test: `tests/skill-load-report-cli.test.js`
- Reference (read-only): `tests/helpers/read-skill.js`, `tests/helpers/root.js`, `tests/permission-sim-root-skip-conformance.test.js`

- [ ] **Step 1: Failing test** — Prove the CRLF defect: copy the three `plugin/skills/review/` files (`code-mode-steps.md`, `step3-skill-load-delta.md`, `review-summary-template.md`) into a scratch directory converted to CRLF (`.replace(/\n/g, '\r\n')`) and confirm the current raw-read assertion in the "review summary template carries the Skill Load Delta section…" test fails against them (`/### Skill Load Delta\n/` does not match). Scratch check only — do not commit a new test file.
- [ ] **Step 2: Implement** —
  - `tests/load-delta-cli.test.js`: add `const { readText } = require('./helpers/read-skill');` and replace the three `fs.readFileSync(path.join(REVIEW, …), 'utf8')` calls (the `code-mode-steps.md`, `step3-skill-load-delta.md`, `review-summary-template.md` reads) with `readText(path.join(REVIEW, …))`. Leave every assertion unchanged. Leave other `fs` uses in the file alone.
  - `tests/skill-load-report-cli.test.js`: for both chmod-based tests ("an unreadable main transcript is counted…" and "an unreadable subagents/ directory is counted…"), change the options argument so it skips on win32 with the stated reason `'win32: chmod does not deny reads'` while keeping the existing `skipUnderRoot('mode bits are ignored under root')` call in the expression (the conformance scan requires the literal text `skipUnderRoot(` and the `./helpers/root` import). E.g. `{ skip: (process.platform === 'win32' && 'win32: chmod does not deny reads') || skipUnderRoot('mode bits are ignored under root').skip }`. Do not modify `tests/helpers/root.js`. Never stub `process.platform`.
- [ ] **Step 3: Run** —
  - Re-run the Step 1 scratch CRLF check against `readText` reads: the three REVIEW-reading assertions pass on CRLF copies.
  - `node --test tests/load-delta-cli.test.js` — PASS.
  - `node --test tests/skill-load-report-cli.test.js` — PASS, and both permission tests run (not reported as skipped) as a non-root POSIX user.
  - `node --test tests/permission-sim-root-skip-conformance.test.js` — PASS.
  - `grep -n "fs.readFileSync(path.join(REVIEW" tests/load-delta-cli.test.js` — no output.
- [ ] **Step 4: Commit** — one commit, message `Fix Windows-only failures in load-delta and skill-load-report tests — refs #3429`.

---

## Self-review

- **Spec coverage:** Deliverable 1 and AC1/AC2 → Task 1 Step 2 first bullet and Step 3 CRLF check + grep. Deliverable 2 and AC3/AC4/AC5 → Task 1 Step 2 second bullet and Step 3 runs (AC4's win32 skip is checked by reading the computed `skip` option; confirmation on the next `windows-latest` run is post-merge). AC6 (`npm test` on ubuntu CI) → Common Step 5 full-suite verification and PR CI.
- **Placeholders:** none.
