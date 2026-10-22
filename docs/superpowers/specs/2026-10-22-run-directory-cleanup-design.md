# Run-directory cleanup: liveness, safe auto-close, tracked spec shells

Date: 2026-10-22. Sibling project to #3944 (findings tiebreak). It covers #3855 and the stale-run half of #2724.

## Intent

The maintainer wants a clean slate (stated 2026-10-22 while designing #3944). A finished run leaves nothing behind. On a normal day, SessionStart shows nothing. Only decisions that truly need a human reach one.

#3944 handles that for review findings. This project handles it for run directories. The risk is asymmetric, as the maintainer agreed: **settle findings aggressively, close runs conservatively.** Closing a run that a sibling session is still driving ends that run's enforcement and event logging mid-flight, and nobody sees it happen. A run left open by mistake only costs one more banner line. Every rule below therefore needs positive evidence before it closes anything.

## What is on disk today (main checkout, measured 2026-10-22)

| Shape | Count | Notes |
|---|---|---|
| Live dir whose only content is tracked `work/{N}-spec.md` (or `spec-N/work/`), with an archive twin | 254 locally; 258 of 264 tracked live dirs on `origin/main` have a twin | The #3855 split state. Reconcile never sees these dirs (`context.js` `iterRunDirsWithState` skips a dir whose twin is clean), and the `archive-run` command it would emit refuses dirs that have no `run-state.json`. |
| `-adhoc-standalone` dir, status `active` or `interrupted`, no archive twin | 78 | 0 staged items and 0 decision lines in every one. Many hold `events.jsonl` (friction events, minted on purpose by `stampAdHocRunDir*`). The banner already skips them. Only the 30-day `adhoc-superseded` rule ever archives them. |
| Formal run, `active` or `interrupted`, no archive twin | 27 | 20 open PRs, 6 closed-unmerged, 1 merged. A session that crashes or is killed never fires SessionEnd, so its run stays `active` forever. |

The SessionStart "unfinished runs" banner shows 3 because `MAX_REPORTED = 3` (`session-residue.js:36`) with no overflow line, not because only 3 are stale. It has no liveness or ownership filter: today it listed three runs that sibling sessions were probably still driving.

## Decided by the maintainer

- Clean-slate target and the asymmetric risk rule above (2026-10-22).
- This is a separate project from #3944 and is brainstormed after it. #3944's non-goals hand over the run-directory lifecycle, the stale-runs banner and the `work/` shells.

Everything else below is **Claude's call**, because the maintainer opted out of the question round. Each such call is marked ◆, and the list at the end collects them for review.

## Design

### Part A. One liveness verdict, from positive evidence

Today nothing in `run-state.json` says whether the owning session is alive. `updatedAt` moves on non-owner writes (`pre-tool-use.js` exemption stamps go to `ctx.runDir` without an owner check), and a worktree lock PID belongs to the worktree, not the run, and goes stale on resume.

**A1. Owner block.** ◆ Every writer that stamps ownership (`record-worktree`, `stampAdHocRunDir`, `stampAdHocRunDirForDenial`) also writes:

```json
"owner": { "sessionId": "…", "host": "<os.hostname()>", "pid": 90405, "pidStartedAt": "<process start time>" , "heartbeatAt": "<ISO>" }
```

- `pid` is the Claude Code process. The Bash tool environment carries `CLAUDE_PID` (measured 2026-10-22: `CLAUDE_PID=90405`, the `claude` process in the `ps` ancestry). **Premise to verify before writing contract text:** that hook processes receive `CLAUDE_PID` too. If they don't, walk the parent chain to the `claude` process instead.
- `pidStartedAt` guards against PID reuse. On Unix read it with `ps -o lstart= -p <pid>`. Where the probe can't run (Windows, or a sandbox with no `ps`), record null. A null start time never yields `dead` from the PID check alone.
- `heartbeatAt` is refreshed by the owner's own hooks (any event attributed to the owner, never a `fallback` attribution), at most once a minute. When a session resumes, its next hook re-stamps `pid`/`pidStartedAt` for the same `sessionId`, which reclaims liveness.

`updatedAt` stays as it is. It is a write timestamp, not a liveness signal, and nothing new reads it as one.

**A2. One verdict module.** ◆ A new `plugin/bin/lib/run-liveness/` exports `runLiveness(runDir, {now, probes}) → { verdict: 'live' | 'dead' | 'unknown', evidence: [...] }`. Its probes are injectable, following the house runner seam.

| Verdict | Requires |
|---|---|
| `live` | The owner PID is alive on this host and its start time matches; or `heartbeatAt` is within 10 min; or a worktree lock on the run's worktree reports an in-use PID; or the last commit on the run's worktree is under 10 min old (`resume-freshness.js`'s existing probe). Any one of these is enough. |
| `dead` | All `live` probes are negative and they ran without error, **plus** one of these: the owner PID was checked on this host and is gone, or alive with a different start time; or status is `interrupted` with `lastEvent: session-end` and no owner heartbeat since. |
| `unknown` | Anything else: a different host, no owner block (legacy runs), a probe that errored, or a null start time with no SessionEnd. |

`unknown` never auto-closes a run. **Legacy runs** (no owner block, which is every run on disk today) have no heartbeat, so "no heartbeat since" would always be true for them. They therefore reach `dead` only through a ◆ legacy route, and the SessionEnd route alone is never enough. The legacy route needs no owner-attributed event in `events.jsonl` (`ownEventRecency`) for 72 h, no in-use lock, and no commit on the worktree for 72 h. A false `interrupted` from #3845 then cannot close an idle but live legacy run. The legacy route is removed once no live run lacks an owner block. That removal condition is checkable: a reconcile count of owner-less non-clean runs that reaches 0.

The module replaces the ad hoc definitions it duplicates: `run-dir-resolve.js` `isDeadRunDir`, the `abandoned-interrupted` recency test in `archive-merged.js` `classifyRunDir`, and `resume-freshness.js`'s probes. Each of those callers asks the module instead (expand-contract: add the module, migrate the callers, then delete the old copies).

### Part B. Auto-close: dead session **and** nothing resumable to lose

Reconcile's archive check gains one disposition table, evaluated after liveness. A run closes automatically only when the verdict is `dead` **and** the work-state row says closing loses nothing. "Close" means: flip `run-state.json` to `clean` with `closedBy: 'reconcile-auto'` and a `closeReason`, log one line to the run's `decisions.md`, then archive the gitignored half to `archive/{run-id}/`. An auto-close never deletes a branch, never removes a worktree (the reaper keeps that job), and never changes GitHub state.

| Run shape | Liveness | Disposition |
|---|---|---|
| Any | `live` | Never touched by any archive path, the existing ones included. ◆ The merged, `orphaned-mint` and `adhoc-superseded` paths gain this one skip and nothing else. |
| Any, for the new rows below | `unknown` | Never touched. The existing merged, `orphaned-mint` and `adhoc-superseded` paths keep acting on `unknown`, because each has its own evidence: a merged PR, a mint that never wrote `config.yml`, or a worktree gone for 30 days. |
| `-adhoc-standalone` | `dead` | Close and archive. `events.jsonl` moves with it, so `/feedback`'s friction input survives. ◆ No 30-day wait. |
| Other standalone run (`-tidy-`, `-sweep-`, `-release-standalone`) | `dead` | Close and archive only when `staged/` is empty. Otherwise leave it: the existing staged-proposals banner and #3898 own it. |
| Formal, PR merged | non-`live` | The existing merged path, unchanged apart from the `live` skip. |
| Formal, PR closed unmerged | `dead` | Close and archive, reason `pr-closed-unmerged`. |
| Formal, no PR; branch absent locally and on origin, or present with no commits beyond its merge-base; and the worktree is absent or clean | `dead` | Close and archive, reason `nothing-to-resume`. |
| Formal, PR open (draft or ready) | `dead` | **Not closed.** The work lives in GitHub. A ready PR closes through the merged or closed path when its PR does. A draft PR with a dead session is an *orphaned, resumable* run (Part C). |
| Formal, unique commits or a dirty worktree, no PR | `dead` | **Not closed.** Orphaned and resumable (Part C). |

**Staged items in a run that would otherwise close.** ◆ Reconcile never carries out a staged item's outcome itself. It gains no GitHub write and no skill-file write. It does two things:
- For the `pr-closed-unmerged` and `nothing-to-resume` reasons, it drops review findings, because they are about code that never merged. The reason is `run-abandoned`, and it is logged to `decisions.md`.
- If any staged item of another kind remains (reflect, queue write, skill update, `shadow-dup-*`), the run **is not auto-closed**. It shows up as an orphan in the banner (Part C) with the reason `staged items need an outcome`, until a session settles them. #3946's outcome mapping applies there.

So no `pending` item is ever archived by an auto-close, and the auto-close path does not depend on #3946 landing.

**Ad hoc runs at SessionEnd.** ◆ `session-end.js` closes and archives its own ad hoc run directly, instead of marking it `interrupted`. This is safe because the run is the ending session's own, ad hoc runs never resume (a resumed session mints a fresh one), and archiving keeps the events. This removes the 78-dir pile at the source. Part B's table is the backstop for crashed sessions.

### Part C. The banner shows only orphans, and all of them

`collectStaleRuns` (`session-residue.js`) changes. ◆

- It lists only runs that are `dead` and *not* auto-closable: the orphaned, resumable rows of Part B. A run that is `live` (a sibling session is driving it) or `unknown` is not residue, and it is not listed.
- The 3-line cap keeps its role, but the banner prints an overflow line ("… and N more — `{command}`") the way the console banner already does with `CONSOLE_OVERFLOW_LINE`.
- Each line names its reason (`draft PR #N, session gone` / `unpushed commits on {branch}` / `staged items need an outcome`), a resume command, and an explicit abandon command, `close-run --run … --abandon`. ◆ Today `close-run --run` already overrides ownership. `--abandon` adds what a human-typed abandonment means:
  - It drops the run's review findings with reason `run-abandoned`.
  - It closes the run's draft PR with a comment that links the archived run, so the PR can't merge later behind an archived run.
  - It closes and archives the run.
  - It refuses when non-review staged items remain, and names them.
  - It does not delete branches and does not touch claim labels (the claims TTL and `/tidy` own those).
- The "only the owning session should close a run" warning is dropped from this banner's instructions. Every listed run is now `dead` by positive evidence, so the warning would be false.

On a normal day this banner is empty, which is the clean-slate target. If it lists something, a session crashed with work in flight, and that is worth one line.

### Part D. The tracked spec shell (#3855): archive it on the run branch, before merge

The materialized header `work/{N}-spec.md` is tracked on purpose. Git-reading checks depend on it being committed during the run: `verify-run-bookends.js`'s gh-absent materialize check, `lib/flow/preflight.js` `specOnBranch`, `pre-tool-use.js` `hasMaterializeCommit` (which arms the bookkeeping-stamps gate, IL-131), and `pr-bookkeeping/precondition.js`.

#3855 offers three options:
- **(c) Stop committing the header.** Rejected, because it breaks every one of those checks and reverses #1210's write-into-the-worktree rule.
- **(b) A batched post-merge housekeeping PR.** Rejected as the steady state, because it keeps producing the pile it then cleans up.
- **(a) Wrap-up `git mv`s the header to `archive/{run-id}/work/` on the run branch before merge.** Chosen ◆. The squash then lands it already archived, so a merged pr-first run leaves no live tracked dir on `main`. It also removes the only reason reconcile commits `[reconcile] archive run` on the main checkout for pr-first runs. Those commits leave local `main` ahead of origin (#3396), and on 2026-10-22 a fresh worktree branched from that diverged `main`.

What (a) requires:

1. **Ordering.** The move is the last commit on the run branch. It comes after every reader of the live path: the wrap-up pack (`pack.js` `resolveRecords`/`closingRecords`, which decides `Fixes #N`), dispatch's `first-call-artifact-check`, and the bookends verification. The builder places it in wrap-up/pr-first-merge sequencing, and a test pins that order.
2. **Readers accept both paths.** Every reader in the list above, and every git-reading check, resolves the header at the live path **or** at `archive/{run-id}/work/`. A run resumed after the move then still reads as materialized. One shared resolver does this, so the rule isn't restated in each reader.
3. **Multi-spec.** `spec-{N}/work/{N}-spec.md` moves the same way, to `archive/{run-id}/spec-{N}/work/`, in the same commit.
4. **local-merge projects.** The same move happens before the local merge. The existing post-merge `archiveRunDir` commit stays only as the fallback for a run that merged without it, such as a branch merged by hand.
5. **Gitignore.** ◆ The `work/**` un-ignore narrows to `work/*-spec.md` (live, `spec-*`, and archive variants). Today it also commits ad hoc agent files (`work/prompt-audit-*.txt`, `spec-3376/work/3376-verification.md`) that no producer in `plugin/` writes.

**Reconcile fixes in the same area** (required for the split state to be reported rather than invisible, per #3855's second deliverable):

- `iterRunDirsWithState`'s clean-twin skip no longer hides a live dir that holds only tracked `work/`. Reconcile reports it as `archived-pending-tracked-move`.
- The completion command reconcile emits for that state has to be one that can succeed. Today `archive-run` refuses a dir with no `run-state.json`, so the emitted command always fails. ◆ The completion is a **shipped** CLI, `plugin/bin/archive-tracked-shells.js` (name left to the builder), because every consumer project on pr-first has the same pile. It moves the shells to `archive/` on a fresh branch and opens one housekeeping PR, never committing on the main checkout. It is batched (one PR for every shell found), and it follows the `housekeeping-auto-merge` policy key for whether that PR auto-merges. Under `worktree-always` reconcile prints this command. Without `worktree-always`, reconcile may run the same move in place, as `archiveRunDir` does today.
- `archiveRunDir`'s commit passes an explicit pathspec. With no `workMoves` it currently runs `git commit -m … --` with no paths, which commits the **whole staged index**. The memory note "archive-run commits whole staged index" records this hazard.

### Part E. One-time cleanup of what is already there

1. **Housekeeping PR for the shells.** Run Part D's shipped CLI once on this repo. It moves every stranded live tracked dir on `main` to `archive/{run-id}/`, or deletes it when an identical archived copy is already tracked. The 6 tracked live dirs with no archive twin are classified individually in the PR body. This also serves as the CLI's first live test.
2. **Report-only release before closing.** ◆ Part B's auto-close ships in one release in **report-only** mode. Reconcile computes each disposition and writes "would close {run} ({reason}, evidence …)" lines to its summary and `reconcile-cache.json`, but closes nothing. The next release turns closing on. Every consumer project therefore gets a dry run on its own pile, not just this repo. Report-only is a release step, not a permanent policy key: the record that turns closing on deletes the switch.
3. **This repo's first pass.** Read the report-only output for this repo before the enabling release, and check every `would close` line on a formal run by hand. Formal runs whose verdict is `unknown` stay put and are listed, not closed.

## Anti-goals (failures even if it technically works)

- **Closing a live run.** Any archive path that closes a run whose verdict is `live` is a defect. So is any new path that closes on `unknown` evidence, on age alone, or on `updatedAt`. The existing paths' own evidence is set out in Part B's table. A probe that errors resolves to `unknown`, never `dead`, and tests show that red against a fail-open variant.
- **Losing resumable work.** Auto-close never deletes a branch, a worktree, or a run whose branch has commits not on `main`.
- **Moving the nag instead of removing it.** Filing a backlog record per orphaned run, or listing live sibling runs "for information", relocates the noise.
- **A new mid-flow stop in `auto` mode.** Auto-close is reconcile automation logged to `decisions.md`, and the banner is SessionStart output, not a stop.
- **Committing on the main checkout under `worktree-always`.** Every tracked-file move goes through a branch and a PR.

## Constraints

- **Expand-contract.** `run-state.json` is read by installed builds over this repo's directories and every consumer project's. The `owner` block is additive. Readers treat a missing block as legacy (the legacy route above) and never as an error. Old copies of the liveness logic are removed only after every caller uses the module.
- **The header move changes `materialize.md`'s contract** ("committed as audit trail") to "committed during the run, archived on the branch at wrap-up". Update `_shared/pipeline-run-dir.md`'s anchoring-exception text in the same change.
- **Cross-platform.** PID and start-time probes degrade to `unknown` on Windows and in sandboxes. The `windows-checkout-test-parity` skill applies to any new path matching.
- **Cloud parity.** A cloud or Routine sandbox is ephemeral, so its run dirs die with it. The only cloud-relevant part is the header move, and the gh-absent bookends check must keep passing (reader rule 2).
- Skill edges go in `docs/skill-graph.md` only. New reconcile checks follow `docs/reconcile-checks.md`. Hook changes follow `docs/hooks.md`.

## Success criteria

- After a pr-first run merges, `git ls-tree origin/main .claude-tweaks/pipelines/` lists no live dir for it, and no `[reconcile] archive run` commit is made for it.
- After the housekeeping PR, `origin/main` has no live tracked run dir whose run is finished.
- A session that ends normally leaves no ad hoc run outside `archive/`.
- A run whose session crashed reaches `dead` (by PID) on the next reconcile on the same host. It auto-closes when its work-state row allows, otherwise it appears in the banner with resume and abandon commands.
- A run driven by a live sibling session never appears in the banner and is never closed, and a test covers this with a live-PID fixture.
- The banner prints an overflow line whenever it has more than 3 rows.
- `archiveRunDir` never commits without a pathspec, enforced by a test.

## Non-goals

- Archive retention or pruning of `archive/` itself (1,769 dirs locally). If the slate should also mean a small archive, that is its own decision.
- Worktree reaping and the `removal-failed` stuck worktree records (#3214–#3217, #3295, #3516). The reaper keeps its job, and this project only stops relying on worktree presence as a liveness proxy.
- Record claim labels (`bot:in-progress`) on records whose run died. The claims registry TTL and `/tidy` keep that job.
- The nested `claude -p` SessionEnd mis-attribution (#3845). It is in flight separately. It does matter here, because it writes a false `interrupted`, so Part A's `dead` route through SessionEnd must also require a stale owner heartbeat, which it does.

## Left to the builder

- Exact grace windows (10 min live heartbeat, 72 h legacy route) can be tuned with evidence, but must not move in the fail-open direction without a measured reason.
- Where exactly the header move sits in the wrap-up / pr-first-merge sequence, provided the ordering test holds.
- The decomposition into records. A natural strangler order:
  1. Part A (module plus owner block, no behavior change).
  2. Part D reader dual-path.
  3. Part D move, reconcile fixes and the shipped shells CLI, then Part E step 1.
  4. Part B in report-only mode, plus Part C (Part E step 2).
  5. Part B closing turned on, plus `--abandon` (Part E step 3).
  6. Removal of the old liveness copies.

## Claude's calls, for review (◆)

1. Owner block with `CLAUDE_PID` plus process start time as the primary liveness evidence, after verifying that hooks receive `CLAUDE_PID`.
2. One `run-liveness` module replacing three duplicated definitions.
3. A 72-hour legacy route for runs that have no owner block, with a measurable removal condition.
4. Dead ad hoc runs archive without the 30-day wait, and SessionEnd archives its own ad hoc run directly.
5. Review findings in an abandoned run are dropped with reason `run-abandoned`.
6. The banner lists only dead-and-resumable runs and gets an overflow line. The "owning session only" warning is dropped.
7. Option (a) for #3855, with dual-path readers and a narrowed gitignore.
8. The shells CLI ships to users (not a maintainer-only script), opens one batched housekeeping PR, and follows `housekeeping-auto-merge`.
9. Reconcile never carries out staged-item outcomes. A run holding non-review staged items is not auto-closed and shows up as an orphan instead.
10. Existing archive paths (merged, `orphaned-mint`, `adhoc-superseded`) gain only a `live` skip, and keep acting on `unknown`.
11. `--abandon` closes the draft PR, drops review findings, and refuses while other staged items remain.
12. Auto-close ships report-only for one release, so every consumer project gets a dry run.
