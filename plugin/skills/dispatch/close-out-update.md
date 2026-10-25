# Dispatch — Close-out Update

Canonical procedure for `close-out.md`'s step 2 when a candidate PR is `DIRTY` (or `mergeable: CONFLICTING`) or `BEHIND` — read only then.
`_shared/github-pr-scan.md` item 11 flags a conflicting PR and never touches it because nobody is present to review a resolution;
close-out is human-present by construction (step 4's gate has no carve-out), so it can offer the update instead of only stopping.
The branch is already public behind its PR, so the update is a **merge** of `origin/{base}` — never a rebase, never a force-push
(`_shared/git-discipline.md`'s Rules and its "Catch-up (`auto`)" paragraph) — and the new HEAD is re-verified before anything is merged on it.

Values come from `gh pr view {number} --json headRefName,headRefOid,baseRefName` (`{head}`, `{base}`).
`{wt}` is `.worktrees/close-out-{number}`. One plain command per Bash call.

1. **Offer.** `AskUserQuestion`, `header`: `"Update PR"`, `multiSelect`: `false`.
   `DIRTY`: options `"Update from {base} (Recommended)"` / `"Stop"`. `BEHIND`: options `"Update from {base} (Recommended)"` / `"Skip update"`.
   The question states what an update does: merges `origin/{base}` in, runs the full suite, pushes, and re-reads CI before the merge question.
   Declining touches nothing — the PR stays exactly as it was.
   `DIRTY` then stops the candidate (`stopped: mergeStateStatus DIRTY — update declined`);
   `BEHIND` was never a stop, so a declined update continues to `close-out.md` step 3 unchanged.
2. **Worktree.** `BEHIND` first runs `gh pr update-branch {number}` (a merge — never the rebase variant);
   a failure stops the candidate (`stopped: update failed — update-branch rejected`) with the PR untouched.
   The call can return before GitHub's merge has landed, so read `gh pr view {number} --json headRefOid` and require a sha that differs from the pre-update one,
   then `git fetch origin {head}` until `origin/{head}` equals it — one bounded re-read, else stop (`stopped: update failed — head moved`) with the PR as GitHub left it.
   Then `git worktree add --detach .worktrees/close-out-{number} origin/{head}` —
   the git-fallback domain (`_shared/scratch-worktree.md` §2), detached because the run's own worktree may still hold `{head}` checked out,
   and never the main checkout. When the project has a lockfile, run its install command in `{wt}` (the mapping is
   `_shared/worktree-adopt-freshness.md` step 4).
3. **Merge (`DIRTY` only).** `git -C {wt} fetch origin {base}`, then `git -C {wt} merge --no-edit origin/{base}`.
   On a conflict, record `{conflicted-files}` with `git -C {wt} diff --name-only --diff-filter=U` and resolve per
   `_shared/git-discipline.md`'s Merge conflict resolution — both sides read, both intents kept. The human is present, so that section's
   ask-the-user fallback applies here (unlike the `auto` catch-up). Then `git -C {wt} add {paths}` and `git -C {wt} commit --no-edit`.
   An unresolvable conflict: `git -C {wt} merge --abort`, stop the candidate (`stopped: update failed — conflict not resolved`), nothing pushed.
   A merge that brings in nothing means the forge's state was stale — tear down (step 7), re-run step 2's mergeability read once, and hand off nothing.
4. **Verify.** `verify.js` checks only the checkout it runs from (`test/verification.md`'s cwd note), so run it with the shell's cwd inside `{wt}`
   (a standalone `cd`, never chained), with the project's full command set per `/claude-tweaks:test`'s `verification.md`, then `verify.js --stamp-status`.
   Continue only when `verifiedHead` is true, `scope` is `full`, and the stamp's `sha` equals `git -C {wt} rev-parse HEAD`.
   Otherwise stop (`stopped: update failed — verification`), push nothing, and report `{wt}` so the human can fix and re-run close-out;
   the worktree stays. On `BEHIND` the update is already on GitHub — the PR stays unmerged and the report says so.
5. **Push (`DIRTY` only).** `git -C {wt} push origin HEAD:{head}` — plain. A rejection is reported and stops the candidate
   (`stopped: update failed — push rejected`); it is never retried as a force-push.
6. **Re-read CI on the new HEAD.** Confirm `gh pr view {number} --json headRefOid` equals the verified sha — one re-read if it lags; a sha that still differs stops the candidate
   (`stopped: update failed — head moved`), since one sha is never verified and another merged.
   Wait with `gh pr checks {number} --watch` — the one place close-out waits, since the update itself created the pending state.
   Then re-run `close-out.md` step 1's read: only `passing` continues (otherwise `stopped: CI {status} after update`).
   Re-run step 2's mergeability read once: any status step 2 does not proceed on (`DIRTY`, `BEHIND` again because the base moved during the wait, `UNKNOWN`)
   stops the candidate (`stopped: mergeStateStatus {status} after update`). There is no second offer in the same run; the human re-runs close-out.
7. **Tear down.** From the main checkout's cwd, `git fetch origin {head}`, then `git -C {wt} merge-base --is-ancestor HEAD origin/{head}`;
   on exit 0, `git worktree remove .worktrees/close-out-{number}` (`ExitWorktree` does not operate on `.worktrees/`, `_shared/scratch-worktree.md` §6).
   Non-zero: list `git log origin/{head}..HEAD --oneline` and remove nothing. A failed step 4 is the only other case where the worktree stays.
8. **Hand off.** Pass the confirmation gate (`close-out-confirmation.md`) `{update-method}` (`merge` on `DIRTY`, `gh pr update-branch` on `BEHIND`),
   `{conflicted-files}` (comma-joined paths, or `none`), and `{resolution-commit}` (short SHA of the merge commit that is the PR's new HEAD —
   the conflict-resolution merge on `DIRTY`, GitHub's update merge on `BEHIND`). Continue at `close-out.md` step 3.
