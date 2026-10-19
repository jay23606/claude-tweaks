# Merged-branch Adopt Precondition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Adopt-or-create from adopting a clean worktree whose branch has already merged. Create a fresh worktree instead.

**Architecture:** One new paragraph in `plugin/skills/_shared/worktree-setup.md`'s `## Adopt-or-create` section defines the merged-branch precondition. The **Already isolated** adopt condition then cites it. The three consumers that restate the adopt condition each get one clause, and a new prose-pin suite pins every edit.

**Tech Stack:** Markdown skill prose; `node --test` with `tests/helpers/read-skill.js`'s `readText`.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T105143-spec-3572/work/3572-spec.md`

## Global Constraints

- Fail open: when `gh` is absent or the lookup errors, the record says to "adopt as today". The git-only check still runs, and the log records which path ran.
- A merged branch is not adopted. It falls through to **Not isolated** via `ExitWorktree(action: "keep")`, exactly as the dirty-tree path does.
- `npm test` passes in full, including the composed-bytes ceiling for the one compose call site of `worktree-setup.md`. That site is `build/SKILL.md:178`, step `worktree-setup`, at 46,929 bytes against a `RAIL_BYTES` of 52,500.
- The pins read files through `readText`, never `fs.readFileSync` (#2763).
- Keep the strings `tests/worktree-adopt-or-create-consolidation.test.js` already pins: `/Adopted/` in multi-spec, `Adopt-or-create` in the build and routine citations, `git status --porcelain`, and `ExitWorktree(action: "keep")`.

**Premise refinement (logged at build).** The record says "the branch tip is an ancestor of `origin/{integration-branch}` with commits of its own". The precise version is: an ancestor, but not on the integration branch's first-parent line. I probed it on real refs:

| Ref | What it is | Reads as merged? |
|---|---|---|
| `3743ed330`, `84f3626eb` | Tips merged by merge commit | yes |
| `origin/main`, `origin/main~3` | A fresh branch cut at a main commit | no |
| This branch's `HEAD` | Has its own unmerged commit | no |
| `worktree-flow-spec-3536` | Squash-merged #3559 | no — a squash is invisible to git |

`gh pr list --head worktree-flow-spec-3536 --state merged` returns `1`, and the same lookup for `worktree-flow-spec-3571`/`-3572` returns `0`. So the `gh` lookup is the only check that catches a squash merge.

**AC1 control.** AC1 is a presence grep, so the absence-grep control does not apply. Its control is the same command at HEAD: `grep -nF 'merged' plugin/skills/_shared/worktree-setup.md` currently prints only line 226 (Post-creation catch-up's "a merged result"). That line is outside the Adopt-or-create section (lines 29-94), so AC1 holds only once a hit lands inside the section.

## Review Focus

- A fresh branch cut at an integration-branch commit (an ancestor that *is* on the first-parent line) must still adopt. The pin asserts that the first-parent clause is present.
- A squash-merged branch with `gh` unavailable adopts as before. The pin asserts that the fail-open sentence names this case.
- A consumer that still says "clean tree" alone would contradict the new rule. There is one pin per consumer.
- The composed bundle must stay under `RAIL_BYTES`. That is covered by `npm test`'s composed-bytes gate (`tests/bin-lib/skill-audit/context-cost.test.js`).

---

### Task 1: Merged-branch precondition and its pins

**Files:**
- Modify: `plugin/skills/_shared/worktree-setup.md:55-71` — the **Already isolated** paragraph, plus a new paragraph after it
- Modify: `plugin/skills/flow/multi-spec.md:96-97`
- Modify: `plugin/skills/build/worktree-setup.md:7`
- Modify: `plugin/skills/routine/create-and-update.md:19`
- Create: `tests/worktree-adopt-merged-branch-precondition.test.js`

**Interfaces:** none (prose).

- [ ] **Step 1: Write the failing test.** Create `tests/worktree-adopt-merged-branch-precondition.test.js` in the shape of `tests/worktree-adopt-or-create-consolidation.test.js`:
  - It has a `'use strict'` header and a one-line `#3572` comment.
  - It uses `readText` from `./helpers/read-skill`.
  - A `region()` helper slices `## Adopt-or-create` up to `## Pre-creation reconcile`, and asserts that both anchors exist.

  Tests, each built from `assert.ok(text.includes(LITERAL))`:
  1. `'Adopt-or-create names the merged-branch precondition'`. The region includes `**Merged-branch precondition (clean tree only).**` and `--state merged`.
  2. `'the git-only check is an ancestor not on the first-parent line'`. The region includes both of these:
     - ``git merge-base --is-ancestor HEAD origin/{integration-branch}``
     - ``git rev-list --first-parent origin/{integration-branch}``
  3. `'a merged branch falls through like a dirty tree'`. The region includes ``fall through to **Not isolated** via `ExitWorktree(action: "keep")` exactly as a dirty tree does``.
  4. `'the check fails open and logs its path'`. The region includes `a squash-merged branch adopts as before (fail open)`.
  5. `'the adopt condition cites the precondition'`. The region includes `and the branch passes the merged-branch precondition below`.
  6. `'consumers restate the narrowed adopt condition'`:
     - `multi-spec.md` includes `(already isolated, clean tree, branch not merged)` and `(not isolated, dirty, or on a merged branch)`.
     - `build/worktree-setup.md` includes `branch (not isolated, dirty, or on a merged branch)` and `branch (already isolated, clean tree, branch not merged`.
     - `routine/create-and-update.md` includes `already isolated (with a clean tree on an unmerged branch)`.

- [ ] **Step 2: Run the test to verify it fails.**
  Run: `node --test tests/worktree-adopt-merged-branch-precondition.test.js`
  Expected: FAIL. All 6 tests fail, because none of the literals exist yet.

- [ ] **Step 3: Write the prose.**

  In the **Already isolated** paragraph, replace `Empty (clean) → **adopt**` with `Empty (clean), and the branch passes the merged-branch precondition below → **adopt**`.

  Insert this paragraph directly after the **Already isolated** paragraph, before **Dependency freshness check**:

  > **Merged-branch precondition (clean tree only).** A clean tree is not enough: the current branch may be one whose PR already merged. Check two things. `gh pr list --head {current-branch} --state merged --json number --jq length` returning non-zero means merged; this is the only check that catches a squash merge. The tip being an ancestor of `origin/{integration-branch}` (`git merge-base --is-ancestor HEAD origin/{integration-branch}`) but absent from its first-parent line (`git rev-list --first-parent origin/{integration-branch}`) means merged by a merge commit. A fresh branch cut at an integration-branch commit sits on that line and is not merged. Either check true → do not adopt: fall through to **Not isolated** via `ExitWorktree(action: "keep")` exactly as a dirty tree does. In #3536's run the session sat in a clean worktree whose PR #3526 had squash-merged minutes earlier. Adopting would have built on the merged branch, opened a second PR from it, and left the run in a reap-eligible worktree. When `gh` is absent or the lookup errors, the git check still runs and a squash-merged branch adopts as before (fail open). The caller logs which path ran: adopted, merged (naming the check), or lookup failed.

  Consumer edits:
  - `multi-spec.md`: `**Adopted** (already isolated, clean tree)` → `**Adopted** (already isolated, clean tree, branch not merged)`, and `**Created** (not isolated, or dirty)` → `**Created** (not isolated, dirty, or on a merged branch)`.
  - `build/worktree-setup.md:7`: `**Created** branch (not isolated, or dirty)` → `**Created** branch (not isolated, dirty, or on a merged branch)`, and `**Adopted** branch (already isolated, clean tree —` → `**Adopted** branch (already isolated, clean tree, branch not merged —`.
  - `routine/create-and-update.md:19`: `already isolated (with a clean tree) adopts` → `already isolated (with a clean tree on an unmerged branch) adopts`.

- [ ] **Step 4: Run the tests to verify they pass.**
  Run: `node --test tests/worktree-adopt-merged-branch-precondition.test.js tests/worktree-adopt-or-create-consolidation.test.js`
  Expected: PASS, 0 failures.

  Then check the remaining acceptance points:
  - `grep -nF 'merged' plugin/skills/_shared/worktree-setup.md` prints new line numbers between the `## Adopt-or-create` and `## Pre-creation reconcile` headings (find those with `grep -n '^## '`), plus the old catch-up hit.
  - The composed bytes for step `worktree-setup` stay under 52,500 (`composedBytesReport` against `plugin/`).

- [ ] **Step 5: Revert-to-red.** For each of the four edited prose files, write `git show HEAD:{path}` to a scratch copy. Point a scratch copy of the suite at them, or swap the files and restore them within the same command, and confirm that every one of the 6 tests fails against the pre-change text. Record the result in the report.

- [ ] **Step 6: Commit.**
  ```bash
  git add plugin/skills/_shared/worktree-setup.md plugin/skills/flow/multi-spec.md plugin/skills/build/worktree-setup.md plugin/skills/routine/create-and-update.md tests/worktree-adopt-merged-branch-precondition.test.js
  git commit -m "Add a merged-branch precondition to Adopt-or-create — a clean worktree whose PR already merged gets a fresh worktree (refs #3572)"
  ```
