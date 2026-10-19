---
files:
  - plugin/skills/build/plan-authoring-checks.md
---

# Merge Small Adjacent Tasks at Plan Time

**Persona:** A `/claude-tweaks:build` session (or the maintainer reviewing its plan) drawing task boundaries for a multi-task plan.
**Goal:** Avoid paying a separate implementer dispatch and task review for a second task that only consumes the first one's output.
**Entry point:** `/claude-tweaks:build` Spec Step 3 (or Design Step 3), while running the checks in `plugin/skills/build/plan-authoring-checks.md` before finalizing the plan.
**Success state:** Each qualifying pair of adjacent tasks is written as one task, at least two tasks remain, and the plan header carries no batch marker the merge didn't need.

## Steps

### 1. Spot a mergeable pair
- **URL:** the draft plan's `### Task N:` list, and `plan-authoring-checks.md`'s **Adjacent-task merge.** paragraph, directly after the **Batched-plan marker.** paragraph.
- **Action:** Walk adjacent task pairs. A pair qualifies when all three conditions hold: the two tasks touch the same files, the second only builds on the first's output, and the second adds no separately reviewable surface. Examples: "add a column" plus the one-line constant that exposes it; "add a job" plus "remove the code it replaces".
- **Should feel:** Like trimming ceremony. Nothing about the work itself changes, only how many dispatch-and-review cycles it costs.
- **Should understand:**
  - Each separate task costs an implementer dispatch and a task review, even when the second task only consumes the first's output.
  - This is plan granularity, not SDD's batch rule. The **Batched-plan marker.** paragraph covers same-shape edits across files and fast-lane transcription plans. This one covers sequential same-file tasks.
- **Red flags:**
  - Merging a second task that has its own tests or behavior a reviewer would judge separately, that touches different files, or that is independently risky.

### 2. Write the merged task, with no marker
- **URL:** the plan file.
- **Action:** Fold the second task into the first as a single `### Task N:` and renumber. Add no `**Execution:** batched` line or `[batch]` title.
- **Should feel:** Uneventful. `plan-audit.js --count-tasks` reports one fewer `tasks` and the same `batched` value as before.
- **Should understand:**
  - The merged task still gets its one task review.
  - Under `ceremony-profile: fast-lane`, a plan that reaches `tasks: 1` with `batched: false` skips the whole-branch review (roster tag `sdd-whole-branch-review`). So merge only while at least two tasks remain.
- **Red flags:**
  - A multi-task plan merged down to one task just to reach the whole-branch-review skip.
  - A batch marker added to a merged plan.

## Origin
- Created during build of #3379, part of the "Build dispatch cost shape" decomposition (origin #3229). In a measured 10-task build, combining small adjacent tasks would have saved two implement-and-review cycles.
- Pinned by `tests/ceremony-profile-roster.test.js`, through the paragraph's clauses and its position after the Batched-plan marker paragraph, and by `tests/bin-lib/plan-audit/parser.test.js`'s `countTasks` guard.
- Related: `derive-a-reader-inventory-from-read-call-sites-3397.md`, another plan-authoring check that `/claude-tweaks:build` applies before a plan is finalized.
