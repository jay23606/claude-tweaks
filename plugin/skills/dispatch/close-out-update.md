# Dispatch — Close-out Update

Canonical procedure for `close-out.md`'s step 2 when a candidate PR is `DIRTY` (or `mergeable: CONFLICTING`) or `BEHIND`,
or a prior run's `{wt}` exists for it — read only then.
`_shared/github-pr-scan.md` item 11 flags a conflicting PR and never touches it because nobody is present to review a resolution;
close-out is human-present by construction (step 4's gate has no carve-out), so it can offer the update instead of only stopping.
The branch is already public behind its PR, so the update is a **merge** of `origin/{base}` — never a rebase, never a force-push
(`_shared/git-discipline.md`'s Rules and its "Catch-up (`auto`)" paragraph) — and the new HEAD is re-verified before anything is merged on it.

Values come from `gh pr view {number} --json headRefName,headRefOid,baseRefName` (`{head}`, `{base}`, the pre-update head).
`{main-checkout}` is the repository's main checkout root, where close-out runs; `{wt}` is the absolute `{main-checkout}/.worktrees/close-out-{number}` —
the git-fallback domain (`_shared/scratch-worktree.md` §2), never under `.claude/worktrees/`. Resolve both once and paste them as literals (§7), and double-quote every pasted path and ref (`{wt}`, `{main-checkout}`, `{head}`, `{base}`) in the commands below —
a checkout path may contain a space and a branch name may contain shell metacharacters.
One plain command per Bash call. Stops after step 2 tear down first (step 7). A command that fails outside the cases named below
stops the candidate (`stopped: update failed — command failed`) the same way.

1. **Offer.** Skipped when `{wt}` already exists (step 2 resumes it). `AskUserQuestion`, `header`: `"Update PR"`, `multiSelect`: `false`.
   `DIRTY`: options `"Update from {base} (Recommended)"` / `"Stop"`. `BEHIND`: options `"Update from {base} (Recommended)"` / `"Skip update"`.
   The question states what an update does: merges `origin/{base}` in, runs the full suite, pushes, and re-reads CI before the merge question —
   and that the new head may dismiss existing approvals on a repo that dismisses stale reviews, so the merge may end `armed`, not `merged`.
   Each option's `description` states its consequence in one clause: the update option merges the base into the PR branch, re-verifies, and pushes;
   `"Stop"` and `"Skip update"` leave the PR untouched, `"Stop"` ending this candidate and `"Skip update"` continuing to the merge question.
   Declining touches nothing — the PR stays exactly as it was.
   `DIRTY` then stops the candidate (`stopped: mergeStateStatus DIRTY — update declined`);
   `BEHIND` was never a stop, so a declined update continues to `close-out.md` step 3 unchanged.
2. **Worktree.** To pin, `git fetch origin {head}` and require `git rev-parse origin/{head}` to equal the expected head — the values line's current `headRefOid`
   on a resume and before any update, the post-update sha after `BEHIND`'s update below; a ref missing or stale locally is fetched once more,
   and a mismatch after that stops (`stopped: update failed — head moved`).
   **Resume.** When `{wt}` already exists, it is a prior run's failed update: add nothing, pin, then compare it with `origin/{head}`.
   A `{wt}` mid-merge (`git -C {wt} rev-parse --verify --quiet MERGE_HEAD` exits 0) or holding tracked changes
   (`git -C {wt} status --porcelain --untracked-files=no` prints anything) is not resumable as it is: stop (`stopped: update failed — conflict not resolved`),
   keep `{wt}`, and tell the human to finish the merge in it or remove it.
   `git -C {wt} merge-base --is-ancestor origin/{head} HEAD` exits 0 (the PR head plus any unpushed resolution or fix): resume at step 4.
   Else `git -C {wt} merge-base --is-ancestor HEAD origin/{head}` exits 0 (the PR moved ahead, e.g. a late-landing update): `git -C {wt} checkout --detach origin/{head}`, then step 4.
   Neither (diverged): stop (`stopped: update failed — head moved`), keep `{wt}`, and tell the human to merge `origin/{head}` into it or remove it.
   Before step 4, recover `{conflicted-files}`: `git -C {wt} log --merges -1 --format=%H origin/{head}..HEAD` names the resolution `{merge}` —
   `git -C {wt} merge-tree --write-tree --name-only --no-messages {merge}^1 {merge}^2` lists its conflicted paths after the tree line (exit 1: it conflicted; exit 0: `none`; any other exit — git older than 2.38, an unresolvable ref — `unknown`);
   no merge commit is a `BEHIND` update: `none`.
   **Fresh.** Otherwise pin, then `git worktree add --detach {wt} origin/{head}` before anything touches the PR — detached because the run's own worktree
   may still hold `{head}` checked out, and never the main checkout. `BEHIND` then runs `gh pr update-branch {number}` (a merge — never the rebase variant);
   a failure stops the candidate (`stopped: update failed — update-branch rejected`).
   The call can return before GitHub's merge has landed, so re-read `gh pr view {number} --json headRefOid` — up to 3 reads, a few seconds apart, each its own plain command — for a sha that differs from the pre-update one
   (none appearing: `stopped: update failed — head moved`); pin again to that post-update sha, then `git -C {wt} checkout --detach origin/{head}`.
3. **Merge (`DIRTY` only).** `git -C {wt} fetch origin {base}`, then `git -C {wt} merge --no-edit origin/{base}`.
   On a conflict, record `{conflicted-files}` with `git -C {wt} diff --name-only --diff-filter=U` and resolve per
   `_shared/git-discipline.md`'s Merge conflict resolution — both sides read, both intents kept. The human is present, so that section's
   ask-the-user fallback applies here (unlike the `auto` catch-up). Then `git -C {wt} add {paths}` and `git -C {wt} commit --no-edit`.
   An unresolvable conflict: `git -C {wt} merge --abort`, stop the candidate (`stopped: update failed — conflict not resolved`), nothing pushed.
   A merge that brings in nothing (HEAD still `origin/{head}`) means the forge's state was stale: re-run step 6's mergeability read —
   a stop-set status stops the candidate (`stopped: mergeStateStatus {status} after update`); otherwise hand off nothing and continue at `close-out.md` step 3.
4. **Verify.** `verify.js` checks only the checkout it runs from (`test/verification.md`'s cwd note), so a standalone `cd {wt}` (never chained) comes first.
   When the project has a lockfile, run its install command there (the mapping is `_shared/worktree-adopt-freshness.md` step 4) — after the merge, which may change it.
   Then `node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js"` with the project's full command set per `/claude-tweaks:test`'s `verification.md`, then `node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --stamp-status`,
   then a standalone `cd {main-checkout}` whatever the result, before any later step.
   Continue only when `verifiedHead` is true, `scope` is `full`, and the stamp's `sha` equals `git -C {wt} rev-parse HEAD` — that sha is `{verified-sha}`.
   Otherwise stop (`stopped: update failed — verification`), push nothing, keep `{wt}`, and report it with the paste-ready re-run
   `/claude-tweaks:dispatch close-out #{record}` (`{record}` = a `Fixes` record of the PR), which resumes here (step 2). On `BEHIND` the update is
   already on GitHub, so that resume — never a later merge on CI alone — is what clears it.
5. **Push.** Only when `{wt}` holds commits the PR lacks (`git -C {wt} merge-base --is-ancestor HEAD origin/{head}` exits non-zero — a `DIRTY` resolution or a resumed fix):
   `git -C {wt} push origin HEAD:{head}` — plain. A rejection is reported and stops the candidate
   (`stopped: update failed — push rejected`); it is never retried as a force-push.
6. **Re-read CI on the new HEAD.** Confirm `gh pr view {number} --json headRefOid` equals `{verified-sha}` — one re-read if it lags; a sha that still differs stops the candidate
   (`stopped: update failed — head moved`), since one sha is never verified and another merged.
   A watch started straight after a push can find no checks and exit at once, so first repeat `_shared/pr-first-merge.md` Step 2.5's head-run read
   (`gh run list --commit {verified-sha}`) until it lists a run — up to 3 reads; still empty adds nothing (Step 2.5's empty-runs rule, e.g. no or path-filtered workflows),
   so continue to the watch and step 1's read, which decide.
   Then wait with `gh pr checks {number} --watch` as its own Bash call with an explicit long timeout (the tool's maximum) — the one place close-out waits,
   since the update itself created the pending state; a timeout is `stopped: CI pending after update`.
   Then re-run `close-out.md` step 1's read: only `passing` continues (otherwise `stopped: CI {status} after update`),
   and re-check `headRefOid` against `{verified-sha}` as above, since a push may have landed during the wait.
   Last, re-run step 2's mergeability read. The post-update stop set is `DIRTY`, `mergeable: CONFLICTING`, `BEHIND` (the base moved during the wait), a string result, or `null` —
   each stops the candidate (`stopped: mergeStateStatus {status} after update`). `UNKNOWN` is GitHub's lazily computed mergeability:
   re-read it — up to 3 reads, a few seconds apart, each its own plain command — and stop only if still `UNKNOWN` (`stopped: mergeStateStatus UNKNOWN after update`).
   Any other status continues. There is no second offer in the same run; the human re-runs close-out.
7. **Tear down.** Runs after step 6, after step 3's brings-in-nothing read, and first on every stop after step 2 — except a failed step 4
   and any stop on a resume or on `BEHIND` after `gh pr update-branch` succeeded and before step 4 passes, each of which keeps `{wt}` as the resume marker
   (a pre-update `{wt}` is an ancestor of `origin/{head}`, so the check below would remove it); a rejected `gh pr update-branch` landed nothing, so it tears down.
   From `{main-checkout}` (a standalone `cd {main-checkout}` first if the shell is elsewhere), `git fetch origin {head}`, then `git -C {wt} merge-base --is-ancestor HEAD origin/{head}`;
   on exit 0, `git worktree remove {wt}` (`ExitWorktree` does not operate on `.worktrees/`, `_shared/scratch-worktree.md` §6).
   Non-zero: list `git -C {wt} log origin/{head}..HEAD --oneline` and remove nothing — the next run's step 2 resumes `{wt}`, or stops on it once the PR head has diverged.
8. **Hand off.** Pass the confirmation gate (`close-out-confirmation.md`) `{update-method}` (`merge` on `DIRTY`, `gh pr update-branch` on `BEHIND`; on a resume, `merge` when step 2 found a `{merge}`, else `gh pr update-branch`),
   `{conflicted-files}` (comma-joined paths or `none`; on a resume, as step 2 recovered them), `{resolution-commit}` (short `{verified-sha}`, the PR's new HEAD —
   the conflict-resolution merge on `DIRTY`, GitHub's update merge on `BEHIND`; on a resume that found a `{merge}`, short `{merge}`, since a later fix commit is not the resolution), `{verified-sha}` itself (`close-out.md` step 5 merges only that head),
   and step 6's latest CI and mergeability reads. Continue at `close-out.md` step 3.
