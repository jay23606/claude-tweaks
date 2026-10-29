# Dispatch First-Call Profile Re-measure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-run the #3212 Sonnet-vs-Opus /flow-bypass comparison on the slimmed build,test procedure, record it with raw per-firing counts, and set the dispatch first-call profile line from the result.

**Architecture:** An evidence file in `docs/reference/` holds the per-firing table for both arms. `plugin/skills/dispatch/task-prompt.md`'s first-call profile line, and the conformance test that pins it, cite that file. The Sonnet arm cannot be produced in-run: it needs at least 10 new live dispatch firings on the Standard profile (ops ledger row 1, `reason-not-auto: live-verification`).

**Tech Stack:** Markdown skill prose; `node --test` conformance suite.

**Spec:** `.claude-tweaks/pipelines/2026-10-29T000857-record-4030/work/4030-spec.md`

## Global Constraints

- At least 10 firings per arm, counting /flow bypasses and gate failures (Deliverable 1).
- Move to `[Use: Standard]` only if Sonnet's bypass count is 1/10 or less (Deliverable 2).
- Keep Capable only where judgment needs it: size:high implementers, and review lenses that call for it (Deliverable 2).
- `task-prompt.md`'s profile line cites the new evidence, whichever way it lands (AC 2).
- If moved: dispatch-agent median seconds per turn falls below 5 over 10 runs (AC 3).

## Review Focus

- A firing that never claimed (no `Step 2.8: claimed #N` line) counts as a full bypass. A firing that claimed but wrote no `config.yml` counts as a Manifesto-only skip. Both count as bypasses, matching #3212's two shapes.
- A firing whose record was already shipped or claim-contested is not a bypass, and is excluded from that arm's denominator.
- A Sonnet-arm firing resolved through `model-ceiling: standard` logs `source: ceiling`. That source is how the arm is identified in the archive, so an Opus-arm row must show `source: default`.
- A bundle group counts as one firing, not one per record.
- After a flip, the second-call template (`[Use: Standard]`, byte-identical) must stay unchanged.

---

### Task 1: Record the Opus arm from archived firings

**Files:**
- Create: `docs/reference/dispatch-first-call-profile-evidence.md`

**Interfaces:**
- Produces: a markdown table `| Run id | Group | Model (source) | Claimed | config.yml | Bypass | Gate failure |`, one row per first-call firing whose run id is later than `2026-10-26T110220` (the close of #4027), under a `## Opus arm` heading.

- [ ] **Step 1:** For each run dir under the main checkout's `.claude-tweaks/pipelines/` (and its archive), from after #4027 closed, that carries a `first-call model resolved to opus (source: default)` line: read `decisions.md` for the `Step 2.8: claimed` line, check that `config.yml` exists, and read the two-call gate outcome. Take at least 10 firings.
- [ ] **Step 2:** Write the rows plus a totals line, `Opus: {b} bypasses / {n} firings, {g} gate failures`.
- [ ] **Step 3:** Commit `docs/reference/dispatch-first-call-profile-evidence.md`.

### Task 2: Record the Sonnet arm (BLOCKED: ops ledger row 1)

**Files:**
- Modify: `docs/reference/dispatch-first-call-profile-evidence.md` (add a `## Sonnet arm` section)

**Interfaces:**
- Consumes: Task 1's table shape.
- Produces: `Sonnet: {b} bypasses / {n} firings, {g} gate failures`, with n ≥ 10.

- [ ] **Step 1:** Wait for at least 10 live first-call firings with `first-call model resolved to sonnet (source: ceiling)`, run under a temporary `model-ceiling: standard` policy. This is an operational action on the shared dispatch queue and is not executable inside this build.
- [ ] **Step 2:** Tabulate those firings exactly as in Task 1 Step 1, then commit.

### Task 3: Set the first-call profile line from the measured result

**Files:**
- Modify: `plugin/skills/dispatch/task-prompt.md:270-272` (first-call `[Use: …]` line) and `:519` (continuation-template wording "`capable` for the first call")
- Test: `tests/dispatch-model-profile-conformance.test.js:57-67`

**Interfaces:**
- Consumes: Task 2's Sonnet total and Task 1's Opus total.

- [ ] **Step 1: Update the test.** `FIRST-call template resolves the {Capable|Standard} profile`, plus a same-line citation assertion `assert.match(line, /dispatch-first-call-profile-evidence\.md/)`. Pick Standard when Sonnet bypasses ≤ 1/10, otherwise Capable.
- [ ] **Step 2:** Run `node --test tests/dispatch-model-profile-conformance.test.js`. Expected: FAIL on the citation assertion.
- [ ] **Step 3:** Rewrite line 270 so it reads `[Use: {Capable|Standard}] -- {Sonnet b/n vs Opus b/n on the slimmed procedure} (docs/reference/dispatch-first-call-profile-evidence.md; #3212, #4030)`. Update the `resolve-profile.js` argument at line 272 and the line-519 wording to match. Leave the second-call block unchanged.
- [ ] **Step 4:** Run `node --test tests/dispatch-model-profile-conformance.test.js`. Expected: PASS.
- [ ] **Step 5:** Commit.

### Task 4: Per-turn latency check (only if moved to Standard)

**Files:**
- Modify: `docs/reference/dispatch-first-call-profile-evidence.md` (add a `## Latency after the move` section)

- [ ] **Step 1:** After the flip ships, read `timing.json` from 10 first-call runs and record each run's median seconds per turn, plus the overall median. Expected: below 5 (AC 3). This also needs live post-merge runs.
