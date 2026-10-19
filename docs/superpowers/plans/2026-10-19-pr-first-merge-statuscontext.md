# Normalize StatusContext entries in the pr-first merge gate (#3257) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `_shared/pr-first-merge.md` Step 2.5 classify legacy commit-status (`StatusContext`) rollup entries correctly: a failing entry reads red, and a passing one reads green instead of staying stuck pending.

**Architecture:** This is a prose-only change to the merge gate's rollup classification. One paragraph is inserted before the red/pending/green bullets. A conformance test drives the code twin (`classifyRollup`/`normalizeEntry` in `plugin/bin/lib/pr-checks/classify.js`) with one StatusContext entry per state the prose names. It asserts that the prose's verdict for each state equals the code's. Two places that currently say the merge gate *lacks* this normalization are corrected: `_shared/pr-check-gate.md`'s Classification authority paragraph and `classify.js`'s header comment.

**Tech Stack:** Markdown skill prose, `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T123917-record-3257/work/3257-spec.md` (materialized from GitHub issue #3257)

## Global Constraints

- Commit message style is `{Verb} {what} — {detail}`. The body says `refs #3257`, never `closes` or `fixes`. The trailer is `Claude-Session: https://claude.ai/code/session_014jZCLvzHYqSD85nVGenWvD`.
- The new prose must not contain the phrase ``entry with `conclusion` in``, and must not be appended to that line. The existing `FAILING_CONCLUSIONS equals the merge gate prose list` test keys on that line.
- The state mapping must equal `normalizeEntry`'s. `SUCCESS`, `FAILURE` and `ERROR` are completed, with the state as the conclusion. Every other state (`PENDING`, `EXPECTED`, …) is pending.

## Review Focus

- A `StatusContext` with `state: ERROR` must read red, not just `FAILURE`. Covered: the test iterates every state the prose names.
- An `EXPECTED` state (a required status not yet posted) must read pending, never green. Covered by the same iteration.
- The paragraph must sit before the red bullet so a reader applies it first. Covered by an index-order assertion.
- Removing the paragraph must fail the pin (AC2.1). Covered by a committed go-red control test that runs the same assertion function against the text with the paragraph removed.
- `_shared/pr-check-gate.md` must stop claiming the merge gate holds a failed StatusContext pending forever. Covered in Step 3 (prose, no test).

---

### Task 1: StatusContext normalization in Step 2.5 + conformance test

**Files:**
- Modify: `plugin/skills/_shared/pr-first-merge.md`: insert one paragraph immediately before the line `Classify from both reads, in this order:` (line 148 at authoring time)
- Modify: `plugin/skills/_shared/pr-check-gate.md:14-18`: the Classification authority paragraph's "adds two things the merge gate does not need … StatusContext normalization … would hold that same entry `pending` forever" sentences
- Modify: `plugin/bin/lib/pr-checks/classify.js:1-20`: header comment only, no code change
- Test: `tests/pr-check-gate-conformance.test.js`: append two tests and one helper

**Interfaces:**
- Consumes: `classifyRollup({ rollup, headRefOid, localHead, hasPrCi })` → `{ state: 'red'|'pending'|'green'|… }` from `plugin/bin/lib/pr-checks/classify.js`, an existing export.
- Produces: nothing consumed elsewhere.

**Byte headroom:** `pr-first-merge.md` is 35,360 bytes and the shared ceiling is 51,200. The composed `merge` bundle (pr-first-merge.md + pr-checklist-refresh.md) was ~46,091 bytes in this run's context, and this change adds ~450, which stays under the ceiling. `tests/bin-lib/skill-audit/context-cost.test.js` is the binding pin. Run it in Step 4.

- [ ] **Step 1: Write the failing tests** (append to `tests/pr-check-gate-conformance.test.js`; add `classifyRollup` to the existing `require('../plugin/bin/lib/pr-checks/classify')` destructure)

Add the helper `assertStatusContextNormalization(text)`, which throws via `assert` on any miss:
  - It finds the first `\n\n`-delimited block of `text` that contains `` `StatusContext` ``. `assert.ok(block, 'pr-first-merge.md Step 2.5 names StatusContext normalization')`.
  - The block's index is greater than `text.indexOf('**Read state first')` and less than ``text.indexOf('entry with `conclusion` in')``.
  - The block contains `` `normalizeEntry` `` and `bin/lib/pr-checks/classify.js`.
  - It parses the mapping with ``/((?:`[A-Z]+`(?: or |, ))*`[A-Z]+`) → (red|pending|green)/g``, mapping every `` `STATE` `` token in group 1 to group 2.
  - The parsed map includes `FAILURE: 'red'`, `ERROR: 'red'`, `SUCCESS: 'green'`, `PENDING: 'pending'` and `EXPECTED: 'pending'`.
  - For every parsed state, `classifyRollup({ rollup: [{ __typename: 'StatusContext', context: 'ci/x', state, targetUrl: null }], headRefOid: 'h', localHead: 'h', hasPrCi: true }).state` equals the prose verdict.

Tests:
  - `'AC1.1/AC2.1: Step 2.5 normalizes StatusContext before the red/pending rules — FAILURE red, SUCCESS green, matching normalizeEntry (#3257)'` calls `assertStatusContextNormalization(MERGE)`.
  - `'AC2.1 go-red control: removing the StatusContext paragraph fails the pin'` builds `mutated` as `MERGE` with that `\n\n` block removed. It asserts `mutated !== MERGE`, which fails if the paragraph is absent, so the control cannot pass vacuously. Then it calls `assert.throws(() => assertStatusContextNormalization(mutated))`.

- [ ] **Step 2: Run the tests to verify that they fail**

Run: `node --test tests/pr-check-gate-conformance.test.js`
Expected: FAIL. Both new tests fail (the positive test with `pr-first-merge.md Step 2.5 names StatusContext normalization`, the control on `mutated !== MERGE`), and the 9 existing tests pass.

- [ ] **Step 3: Implement**

(a) Insert this exact paragraph, followed by a blank line, before `Classify from both reads, in this order:` in `plugin/skills/_shared/pr-first-merge.md`:

```markdown
**`StatusContext` entries are normalized first.** A legacy commit-status entry (`StatusContext` — `context`/`state`/`targetUrl`, no `status` or `conclusion`) is read by its `state` before the rules below apply: `FAILURE` or `ERROR` → red, `PENDING` or `EXPECTED` → pending (as is any other unfinished state), `SUCCESS` → green — completed, never pending. The code twin is `bin/lib/pr-checks/classify.js`'s `normalizeEntry`.
```

(b) In `_shared/pr-check-gate.md`'s Classification authority paragraph, rewrite the sentences from "This read adds two things the merge gate does not need:" through "…to complete)." so they say:
  - This read adds one thing the merge gate does not need: `stale`, meaning the PR's `headRefOid` is not local HEAD, so nothing is concluded.
  - StatusContext normalization (a failed StatusContext entry reads `red`, a passing one green) is shared with the merge gate, which normalizes the same way before its rules apply.

Keep every other sentence of that paragraph unchanged.

(c) In `classify.js`'s header comment, remove the `StatusContext entries …` bullet from the "Additions the merge gate does not need" list, which leaves `stale` as its only item. State the StatusContext normalization under "Shared with the merge gate" instead, keeping the same facts and reason. Change no code.

- [ ] **Step 4: Run the tests to verify that they pass**

Run: `node --test tests/pr-check-gate-conformance.test.js tests/bin-lib/pr-checks/classify.test.js tests/pr-first-merge.test.js tests/merge-verification-gate-conformance.test.js tests/bin-lib/skill-audit/context-cost.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/pr-first-merge.md plugin/skills/_shared/pr-check-gate.md plugin/bin/lib/pr-checks/classify.js tests/pr-check-gate-conformance.test.js
git commit -F {msg-file}   # "Normalize StatusContext entries in the pr-first merge gate — state-mapped before red/pending rules, pinned against normalizeEntry" / refs #3257 / Claude-Session trailer
```

---

## Self-review

- **Spec coverage:** Deliverable 1, the sentence citing `normalizeEntry`, is Step 3(a). Deliverable 2, the conformance test, is Step 1. AC1.1 (FAILURE red, SUCCESS green, never pending) is the positive test. AC2.1 (the test fails when the sentence is removed) is the go-red control, which shares the assertion function.
- **Consistency fallout:** Step 3(b) and 3(c) correct the two places that state the merge gate lacks this normalization.
- **Placeholders:** none. `{msg-file}` is the implementer's scratch message file; the worktree shell guard refuses `$(...)` inside a git command.
