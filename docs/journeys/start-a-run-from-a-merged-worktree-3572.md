---
files:
  - plugin/skills/_shared/worktree-setup.md
  - plugin/skills/build/worktree-setup.md
  - plugin/skills/flow/multi-spec.md
  - plugin/skills/routine/create-and-update.md
---

# Start a Run from a Merged Worktree

**Persona:** A session that starts a new run from inside a linked worktree left over from earlier work. It might be a maintainer running `/claude-tweaks:flow #N` after the previous run's PR merged, a headless `/claude-tweaks:dispatch` firing, or `/claude-tweaks:routine`. The worktree's tree is clean, but its branch's PR has already merged.
**Goal:** Build the new record on a fresh branch from the integration branch. The run must not build on top of an already-merged one.
**Entry point:** `_shared/worktree-setup.md`'s `## Adopt-or-create` gate. It runs before any worktree-creation call: `/claude-tweaks:build` Common Step 1, `flow/multi-spec.md`'s shared-worktree Step 1, and `routine/create-and-update.md`'s Step 0.
**Success state:** The run works in a newly created worktree whose branch was cut from the integration branch. The old worktree is still on disk, untouched. `decisions.md` carries one `Adopt-or-create:` line naming which path ran.

## Steps

### 1. Find the session already isolated
- **URL:** `_shared/worktree-setup.md`'s `## Adopt-or-create`, its **Already isolated** branch.
- **Action:** The detection (`GIT_DIR != GIT_COMMON`) says the session is in a linked worktree, and `git status --porcelain` is empty.
- **Should feel:** Like the usual adopt case, right up to the next check.
- **Should understand:**
  - A clean tree is not enough to adopt. The adopt condition now also requires the branch to pass the merged-branch precondition.
- **Red flags:**
  - Adopting on a clean tree alone, without running the merged-branch check.

### 2. Check whether the branch already merged
- **URL:** the **Merged-branch precondition (clean tree only)** paragraph in the same section.
- **Action:** After `git fetch origin {integration-branch}`, run both checks:
  - `gh pr list --head {current-branch} --state merged --json number --jq length` returning non-zero.
  - The tip being an ancestor of `origin/{integration-branch}` but absent from its first-parent line.
- **Should feel:** Mechanical. Two lookups answer whether this branch is spent.
- **Should understand:**
  - A squash merge is invisible to git. Only the `gh` lookup catches it, and #3536's run met exactly that case (PR #3526).
  - A fresh branch cut at an integration-branch commit sits on the first-parent line, so it reads as not merged.
  - When `gh` is absent, the git check still runs, so only a squash-merged branch adopts as before. A check that errors fails open.
- **Red flags:**
  - Treating "ancestor of the integration branch" alone as merged. That catches every fresh branch.
  - Skipping the fetch, so a merge from minutes ago is not visible.

### 3. Leave the merged worktree and create a fresh one
- **URL:** the **Not isolated** branch, reached via `ExitWorktree(action: "keep")`.
- **Action:** Leave the merged worktree on disk, then create a new worktree the way a dirty tree does. Log `AUTO {time} — Adopt-or-create: not adopted, merged ({check})` to the run's `decisions.md`, or follow `_shared/worktree-catchup-no-run-dir.md` when there is no run dir yet.
- **Should feel:** Safe. Nothing is deleted, and the new run starts clean.
- **Should understand:**
  - Adopting would have built on the merged branch, opened a second PR from it, and left the run in a worktree that the reconciler's post-merge reap treats as reap-eligible.
- **Red flags:**
  - Removing or resetting the merged worktree instead of keeping it.
  - A run with no `Adopt-or-create:` line, so nobody can tell which path ran.

## Origin
- Created during build of #3572, a reflect-light finding from #3536. In #3536's run the session sat in `flow+spec-3352-3464` minutes after its PR #3526 squash-merged, and the controller deviated by hand.
- Pinned by `tests/worktree-adopt-merged-branch-precondition.test.js`.
- Related: `get-the-run-ledger-inside-the-worktree-3036.md`, which covers the step right after a worktree is created or adopted.
