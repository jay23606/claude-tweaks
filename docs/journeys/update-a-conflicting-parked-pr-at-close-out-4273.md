---
files:
  - plugin/skills/dispatch/close-out.md
  - plugin/skills/dispatch/close-out-update.md
  - plugin/skills/dispatch/close-out-confirmation.md
  - plugin/skills/_shared/pr-first-merge.md
  - plugin/skills/_shared/github-pr-scan.md
  - tests/close-out-pr-state-contract-conformance.test.js
---

# Update a Conflicting or Behind Parked PR at Close-out

**Persona:** a maintainer closing out an approved `pending-review` PR with `/claude-tweaks:dispatch close-out #{n}`. The PR has fallen behind `main`, or now conflicts with it, because other records merged while it was parked.

**Goal:** bring the PR up to date and merge it in the same sitting, without the work turning into a hand-run catch-up. Close-out must not rewrite the branch, and must never merge a head the full suite hasn't passed.

**Entry point:** `/claude-tweaks:dispatch close-out #{n}` (or the bare form), reaching a candidate whose `mergeStateStatus` is `DIRTY`/`BEHIND` or whose `mergeable` is `CONFLICTING`. A `[pr-stale]` line from `/claude-tweaks:tidy`'s repo-wide scan, which item 11 only flags, is the usual tip-off.

**Success state:** the PR is updated by a merge of `origin/{base}`, never by a rebase or force-push. The full suite passes on the new HEAD through `verify.js`, CI is green on that HEAD, and the confirmation question names the update before anything merges. That merge is pinned to the verified head. If the maintainer declines instead, the PR is left exactly as it was.

## Steps

### 1. Close-out finds the PR conflicting or behind
- **URL:** `dispatch/close-out.md` step 2, routing to `dispatch/close-out-update.md`
- **Action:** close-out re-reads CI, then mergeability.
- **Should feel:** a choice, not a dead end.
- **Should understand:** a `DIRTY`/`CONFLICTING` or `BEHIND` result now leads to an update offer rather than a stop. `BLOCKED` with nothing else wrong still proceeds as before.
- **Red flags:** a bare `stopped: mergeStateStatus DIRTY` with no offer; a recommendation to rebase.

### 2. Answer the update offer
- **URL:** `close-out-update.md` step 1 (`AskUserQuestion`, header "Update PR")
- **Action:** pick "Update from {base}", or decline ("Stop" on `DIRTY`, "Skip update" on `BEHIND`).
- **Should feel:** informed about what will happen to the branch. The question says the update merges `origin/{base}` in, runs the full suite, pushes, and re-reads CI. It also warns that pushing may dismiss existing approvals.
- **Should understand:** declining touches nothing. On `DIRTY` the candidate stops with `stopped: mergeStateStatus DIRTY — update declined`. On `BEHIND` close-out continues to labeling and the merge question as it always did.
- **Red flags:** a decline that still pushes or changes the PR; an offer with no mention of the merge-not-rebase method.

### 3. The update runs in its own worktree
- **URL:** `close-out-update.md` steps 2-5
- **Action:**
  - Close-out pins `origin/{head}` to the PR's head sha and creates a detached `{main-checkout}/.worktrees/close-out-{number}`.
  - On `DIRTY` it merges `origin/{base}` and resolves conflicts, asking the maintainer when a resolution isn't clear-cut. On `BEHIND` it runs `gh pr update-branch` (never the rebase variant).
  - It runs the full suite through `verify.js` and pushes with a plain push.
- **Should feel:** careful: the suite runs before anything is pushed on `DIRTY`, and a conflict that keeps both texts but drops one side's intent gets caught by the suite, not by luck.
- **Should understand:** a failed verification pushes nothing. It keeps the worktree and prints `/claude-tweaks:dispatch close-out #{record}`, and re-running that resumes the verification instead of starting over. On `BEHIND` the update is already on GitHub, so that resume is what clears it. A later merge on CI alone does not.
- **Red flags:** a `git rebase` or a `--force` push; verification run from the main checkout instead of the update worktree; a worktree under `.claude/worktrees/`; a leftover `.worktrees/close-out-*` after a stop that should have torn it down.

### 4. CI is re-read on the new HEAD
- **URL:** `close-out-update.md` step 6
- **Action:** close-out confirms the PR head equals the verified sha and waits for the head's checks. It then re-reads CI and mergeability.
- **Should feel:** like the one wait is worth it, because the update itself created the pending checks.
- **Should understand:**
  - Only `passing` CI on the verified head continues.
  - A head that moved during the wait stops with `stopped: update failed — head moved`.
  - `UNKNOWN` mergeability straight after a push gets a few re-reads before it counts.
  - A PR that is still `DIRTY`, or `BEHIND` again, stops with `stopped: mergeStateStatus {status} after update`. There is no second offer in the same run.
- **Red flags:** merging on the pre-update CI read; a stop on the first `UNKNOWN`.

### 5. Confirm and merge the verified head
- **URL:** `dispatch/close-out-confirmation.md`, then `close-out.md` step 5 → `_shared/pr-first-merge.md` Step 3
- **Action:** read the merge question and confirm.
- **Should feel:** that you are reviewing what changed. The question says the PR was updated by close-out, by which method, which files conflicted, and which resolution commit to look at.
- **Should understand:**
  - CI status and mergeability in the question are the post-update reads.
  - Close-out re-checks the head just before merging and passes the verified sha. Step 3 then appends `--match-head-commit`, so a merge, or the arming of one, is accepted only against the verified head.
  - The update note ends `review it before merging; any approval above predates it.` The approver the question names reviewed the head before the update, not the resolution.
  - Declining here leaves the PR `pending-review`, but an update that already ran stays pushed.
- **Red flags:** a question still showing the pre-update `DIRTY` and recommending Skip; a merge without `--match-head-commit` after an update.

## Origin
- Created during build of #4273. Observed on 2026-10-25 closing out #4028 (PR #4205): close-out stopped on `DIRTY`, the maintainer had to ask for the update by hand, and a cleanly-resolved three-file merge still broke one test that only the full suite caught.
