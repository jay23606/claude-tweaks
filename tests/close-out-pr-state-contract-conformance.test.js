// tests/close-out-pr-state-contract-conformance.test.js — #3029: close-out.md
// step 2 must state resolvePrStateByNumber's positional signature and its full
// string-result contract, and say any string result stops the candidate —
// the missing signature is what let a caller misorder the arguments and read
// 'network-failure' as "not DIRTY".
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readText } = require('./helpers/read-skill');

const CLOSE_OUT = readText(path.join(__dirname, '..', 'plugin', 'skills', 'dispatch', 'close-out.md'));
const UPDATE = readText(path.join(__dirname, '..', 'plugin', 'skills', 'dispatch', 'close-out-update.md'));
const STEP_2_START = CLOSE_OUT.indexOf('2. **Re-check mergeability');
const STEP_2_END = CLOSE_OUT.indexOf('3. **Convert draft to ready');
const STEP_2 = CLOSE_OUT.slice(STEP_2_START, STEP_2_END);

test('close-out step 2 is locatable', () => {
  assert.ok(STEP_2_START >= 0, 'step 2 heading not found — the heading text moved');
  assert.ok(STEP_2_END > STEP_2_START, 'step 3 heading not found after step 2 — the span would be wrong');
});

test('close-out step 2 names the positional signature', () => {
  assert.match(STEP_2, /resolvePrStateByNumber\(repoRoot, number\)/);
});

test('close-out step 2 names every string result the resolver returns', () => {
  for (const s of ['gh-absent', 'network-failure', 'invalid-arguments', 'pr-not-found']) {
    assert.ok(STEP_2.includes(`'${s}'`), `missing '${s}'`);
  }
});

test('close-out step 2 says a string result stops the candidate, never read as not DIRTY', () => {
  assert.match(STEP_2, /string result[\s\S]{0,120}stop[\s\S]{0,120}never read[\s\S]{0,40}not DIRTY/i);
});

// The text of one step-2 clause: from its opening marker up to the next clause's marker.
function routingSpan(step2, from, to) {
  const start = step2.indexOf(from);
  assert.ok(start >= 0, `step 2 clause not found: ${from}`);
  const end = step2.indexOf(to, start + from.length);
  assert.ok(end > start, `step 2 clause end not found: ${to}`);
  return step2.slice(start, end);
}

// STEP_2 with the update-file reference removed from one clause only.
function dropRefIn(step2, from, to) {
  const start = step2.indexOf(from);
  const end = step2.indexOf(to, start + from.length);
  return step2.slice(0, start) + step2.slice(start, end).replace(/close-out-update\.md/g, 'REMOVED') + step2.slice(end);
}

// One numbered step of close-out-update.md: from `\n{n}. **` to `\n{n+1}. **` (or the end).
// Step 0 is the preamble before step 1. Every pin below reads only its own step's span, so a
// clause in one step can never be satisfied by a word that happens to sit in another.
function stepSpan(update, n) {
  const start = n === 0 ? 0 : update.indexOf(`\n${n}. **`);
  assert.ok(start >= 0, `close-out-update.md step ${n} not found`);
  const end = update.indexOf(`\n${n + 1}. **`, start + 1);
  return update.slice(start, end < 0 ? undefined : end);
}

const at = (span, s) => span.indexOf(s);
const before = (span, a, b) => at(span, a) >= 0 && at(span, b) >= 0 && at(span, a) < at(span, b);

// Each pin: [id, step, check(span)]. The go-red table below mutates exactly one pin's clause.
const UPDATE_PINS = [
  ['wt-absolute', 0, (s) => s.includes('`{wt}` is the absolute `{main-checkout}/.worktrees/close-out-{number}`') && s.includes('never under `.claude/worktrees/`')],
  ['offer-skipped-on-resume', 1, (s) => s.includes('Skipped when `{wt}` already exists (step 2 resumes it)')],
  ['approval-warning', 1, (s) => /dismiss existing approvals[\s\S]{0,120}`armed`, not `merged`/.test(s)],
  ['decline-untouched', 1, (s) => s.includes('Declining touches nothing — the PR stays exactly as it was')],
  ['behind-continues', 1, (s) => s.includes('`BEHIND` was never a stop, so a declined update continues to `close-out.md` step 3')],
  ['resume', 2, (s) => s.includes('When `{wt}` already exists, it is a prior run\'s failed update: add nothing, pin')
    && /`git -C \{wt\} merge-base --is-ancestor origin\/\{head\} HEAD` exits 0[^\n]*: resume at step 4/.test(s)],
  ['resume-fast-forward', 2, (s) => /`git -C \{wt\} merge-base --is-ancestor HEAD origin\/\{head\}` exits 0[^\n]*: `git -C \{wt\} checkout --detach origin\/\{head\}`, then step 4/.test(s)],
  ['resume-diverged', 2, (s) => s.includes('Neither (diverged): stop (`stopped: update failed — head moved`), keep `{wt}`, and tell the human to merge `origin/{head}` into it or remove it')],
  ['resume-conflicted-files', 2, (s) => /recover `\{conflicted-files\}`: `git -C \{wt\} log --merges -1 --format=%H origin\/\{head\}\.\.HEAD`[\s\S]{0,80}`git -C \{wt\} merge-tree --write-tree --name-only --no-messages \{merge\}\^1 \{merge\}\^2` lists its conflicted paths/.test(s)
    && s.includes('no merge commit is a `BEHIND` update: `none`')],
  ['resume-expected-head', 2, (s) => /— the values line's current `headRefOid`\s+on a resume/.test(s)],
  ['head-pin', 2, (s) => s.includes('`git fetch origin {head}` and require `git rev-parse origin/{head}` to equal the expected head')
    && s.includes('a mismatch after that stops (`stopped: update failed — head moved`)')],
  ['detached', 2, (s) => s.includes('`git worktree add --detach {wt} origin/{head}`')],
  ['worktree-before-update', 2, (s) => before(s, '`git worktree add --detach {wt} origin/{head}` before anything touches the PR', '`gh pr update-branch {number}`')],
  ['behind-post-update-checkout', 2, (s) => s.includes('pin again to that post-update sha, then `git -C {wt} checkout --detach origin/{head}`')],
  ['nothing-new-stops', 3, (s) => /brings in nothing[\s\S]{0,200}stop-set status stops the candidate \(`stopped: mergeStateStatus \{status\} after update`\)/.test(s)],
  ['cd-into-wt', 4, (s) => s.includes('a standalone `cd {wt}` (never chained) comes first')],
  ['lockfile', 4, (s) => /lockfile[\s\S]{0,120}`_shared\/worktree-adopt-freshness\.md` step 4/.test(s)],
  ['cd-back', 4, (s) => s.includes('then a standalone `cd {main-checkout}` whatever the result')],
  ['stamp-full', 4, (s) => s.includes('`verify.js --stamp-status`')
    && s.includes('`verifiedHead` is true, `scope` is `full`, and the stamp\'s `sha` equals `git -C {wt} rev-parse HEAD`')],
  ['failed-verify-keeps-wt', 4, (s) => /keep `\{wt\}`[\s\S]{0,120}`\/claude-tweaks:dispatch close-out #\{record\}`/.test(s)],
  ['plain-push', 5, (s) => s.includes('`git -C {wt} push origin HEAD:{head}` — plain')
    && [...s.matchAll(/force[- ]push/gi)].every((m) => s.slice(Math.max(0, m.index - 30), m.index).includes('never'))],
  ['head-before-ci', 6, (s) => before(s, 'Confirm `gh pr view {number} --json headRefOid` equals `{verified-sha}`', '--watch`')],
  ['head-run-first', 6, (s) => s.includes('Step 2.5\'s head-run read') && before(s, '`gh run list --commit {verified-sha}`', '--watch`')],
  ['empty-runs-continue', 6, (s) => /up to 3 reads; still empty adds nothing \(Step 2\.5's empty-runs rule[^)]*\),\s+so continue to the watch and step 1's read/.test(s)],
  ['watch-timeout', 6, (s) => /`gh pr checks \{number\} --watch` as its own Bash call with an explicit long timeout[\s\S]{0,160}a timeout is `stopped: CI pending after update`/.test(s)],
  ['ci-step1', 6, (s) => s.includes('re-run `close-out.md` step 1\'s read: only `passing` continues')],
  ['head-after-ci', 6, (s) => before(s, '--watch`', 're-check `headRefOid` against `{verified-sha}`')],
  ['mergeability-reread', 6, (s) => s.includes('re-run step 2\'s mergeability read')],
  ['stop-set', 6, (s) => /post-update stop set is `DIRTY`, `mergeable: CONFLICTING`, `BEHIND`[^.]{0,60}, a string result, or `null`/.test(s)],
  ['unknown-bounded', 6, (s) => /`UNKNOWN`[\s\S]{0,120}up to 3 reads[\s\S]{0,120}stop only if still `UNKNOWN` \(`stopped: mergeStateStatus UNKNOWN after update`\)/.test(s)],
  ['teardown-on-stop', 7, (s) => /first on every stop after step 2 — except a failed step 4\s+and any stop on a resume or on `BEHIND` before step 4 passes, each of which keeps `\{wt\}`/.test(s)],
  ['teardown-next-run', 7, (s) => s.includes('the next run\'s step 2 resumes `{wt}`, or stops on it once the PR head has diverged')],
  ['teardown', 7, (s) => s.includes('`git worktree remove {wt}`')],
  ['handoff-sha', 8, (s) => s.includes('`{verified-sha}` itself')],
  ['handoff-resume-values', 8, (s) => s.includes('on a resume, `merge` when step 2 found a `{merge}`, else `gh pr update-branch`')
    && s.includes('on a resume, as step 2 recovered them') && !s.includes('unrecorded')],
];

function assertUpdateSteps(update) {
  for (const [id, n, check] of UPDATE_PINS) {
    assert.ok(check(stepSpan(update, n)), `close-out-update.md pin ${id} (step ${n})`);
  }
}

function assertUpdateRouting(step2, update, closeOut) {
  // AC1.1 — DIRTY/CONFLICTING and BEHIND route to the update offer, not only a stop
  const dirtySpan = routingSpan(step2, '`mergeStateStatus: DIRTY`', '`mergeStateStatus: BEHIND`');
  const behindSpan = routingSpan(step2, '`mergeStateStatus: BEHIND`', '`mergeStateStatus: BLOCKED`');
  assert.ok(dirtySpan.includes('close-out-update.md'), 'AC1.1: the DIRTY paragraph itself routes to close-out-update.md');
  assert.match(dirtySpan, /CONFLICTING/, 'AC1.1: mergeable CONFLICTING is treated like DIRTY');
  assert.ok(behindSpan.includes('close-out-update.md'), 'AC1.1: the BEHIND clause itself routes to close-out-update.md');
  assert.match(behindSpan, /declining continues/, 'AC1.2: a declined BEHIND update continues');
  assert.ok(!/rebase and re-verify/i.test(step2), 'AC1.1: the old rebase recommendation is gone from step 2');
  // An existing update worktree resumes, whatever the forge now says (a BEHIND update is already on GitHub)
  const wtSpan = routingSpan(step2, 'An existing `.worktrees/close-out-{number}`', '`mergeStateStatus: DIRTY`');
  assert.match(wtSpan, /routes to `close-out-update\.md`'s resume[\s\S]{0,40}regardless of `mergeStateStatus`/, 'an existing update worktree routes to the resume');
  // AC1.2, AC2.1 — anchored per step of the update procedure
  assertUpdateSteps(update);
  // AC4.1 — no path rebases or force-pushes
  assert.match(update, /never a rebase/i, 'AC4.1: states never a rebase');
  assert.match(update, /force[- ]push/i, 'AC4.1: states never a force push');
  assert.ok(update.includes('gh pr update-branch'), 'AC4.1: BEHIND uses gh pr update-branch');
  const spans = [...update.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  for (const s of spans) {
    assert.ok(!/^git\b.*\brebase\b/.test(s), `AC4.1: no git rebase command: ${s}`);
    assert.ok(!/^git\b.*\bpush\b.*(--force|\s-f\b)/.test(s), `AC4.1: no force push command: ${s}`);
    assert.ok(!/^gh pr update-branch\b.*--rebase/.test(s), `AC4.1: no update-branch --rebase: ${s}`);
    assert.ok(!/^git\b.*\bpush\b.*\s\+\S/.test(s), `AC4.1: no +refspec force push: ${s}`);
  }
  // AC5.1 (close-out half) — the Anti-Patterns ban is rescoped to the headless sweep
  assert.ok(!closeOut.includes('Rebasing a `DIRTY` candidate to clear it automatically'), 'AC5.1: old anti-pattern row removed');
  assert.match(closeOut, /\| Rebasing or force-pushing[^\n]*item 11[^\n]*\|/, 'AC5.1: rescoped anti-pattern row names item 11');
}

test('AC1.1/AC1.2/AC2.1/AC4.1/AC5.1: step 2 routes conflicting and behind PRs to the re-verified update path', () => {
  assertUpdateRouting(STEP_2, UPDATE, CLOSE_OUT);
});

test('go-red control: dropping the DIRTY routing from step 2 fails the same assertions', () => {
  const mutated = STEP_2.replace(/close-out-update\.md/g, 'REMOVED');
  assert.throws(() => assertUpdateRouting(mutated, UPDATE, CLOSE_OUT));
});

test('go-red control: dropping only the DIRTY reference fails the routing assertions', () => {
  const mutated = dropRefIn(STEP_2, '`mergeStateStatus: DIRTY`', '`mergeStateStatus: BEHIND`');
  assert.notEqual(mutated, STEP_2, 'the mutation must change step 2');
  assert.throws(() => assertUpdateRouting(mutated, UPDATE, CLOSE_OUT));
});

test('go-red control: dropping only the BEHIND reference fails the routing assertions', () => {
  const mutated = dropRefIn(STEP_2, '`mergeStateStatus: BEHIND`', '`mergeStateStatus: BLOCKED`');
  assert.notEqual(mutated, STEP_2, 'the mutation must change step 2');
  assert.throws(() => assertUpdateRouting(mutated, UPDATE, CLOSE_OUT));
});

test('Review Focus: isolated detached worktree, dependency install, declines', () => {
  // Each check reads its own step's span; the go-red table below covers every pin.
  for (const id of ['wt-absolute', 'detached', 'teardown', 'lockfile', 'behind-continues']) {
    const [, n, check] = UPDATE_PINS.find(([pin]) => pin === id);
    assert.ok(check(stepSpan(UPDATE, n)), `pin ${id} (step ${n})`);
  }
});

// One mutation per pin, each removing or rewriting only that pin's clause in memory.
// [pin id, exact text in close-out-update.md, replacement]
const UPDATE_MUTATIONS = [
  ['wt-absolute', 'is the absolute `{main-checkout}/.worktrees/close-out-{number}`', 'is `.worktrees/close-out-{number}`'],
  ['offer-skipped-on-resume', 'Skipped when `{wt}` already exists (step 2 resumes it). ', ''],
  ['approval-warning', ' —\n   and that the new head may dismiss existing approvals on a repo that dismisses stale reviews, so the merge may end `armed`, not `merged`.', '.'],
  ['decline-untouched', 'Declining touches nothing — the PR stays exactly as it was.\n', ''],
  ['behind-continues', '`BEHIND` was never a stop, so a declined update continues to `close-out.md` step 3 unchanged.', '`BEHIND` stops too.'],
  ['resume', 'exits 0 (the PR head plus any unpushed resolution or fix): resume at step 4.', 'exits 0: add a fresh worktree.'],
  ['resume-fast-forward', ': `git -C {wt} checkout --detach origin/{head}`, then step 4.', ': resume at step 4 as it is.'],
  ['resume-diverged', 'Neither (diverged): stop (`stopped: update failed — head moved`), keep `{wt}`, and tell the human to merge `origin/{head}` into it or remove it.', 'Neither (diverged): resume at step 4.'],
  ['resume-conflicted-files', '`git -C {wt} merge-tree --write-tree --name-only --no-messages {merge}^1 {merge}^2` lists its conflicted paths', 'they are `unrecorded`'],
  ['resume-expected-head', 'the values line\'s current `headRefOid`\n   on a resume and before any update', 'the values line\'s `headRefOid`'],
  ['head-pin', ' and require `git rev-parse origin/{head}` to equal the expected head', ''],
  ['detached', '`git worktree add --detach {wt} origin/{head}`', '`git worktree add {wt} {head}`'],
  ['worktree-before-update', ' before anything touches the PR', ' after the update'],
  ['behind-post-update-checkout', '; pin again to that post-update sha, then `git -C {wt} checkout --detach origin/{head}`.', '.'],
  ['nothing-new-stops', 'a stop-set status stops the candidate (`stopped: mergeStateStatus {status} after update`); otherwise hand', 'then hand'],
  ['cd-into-wt', 'so a standalone `cd {wt}` (never chained) comes first.', 'so run it there.'],
  ['lockfile', 'When the project has a lockfile, run its install command there (the mapping is `_shared/worktree-adopt-freshness.md` step 4) — after the merge, which may change it.\n', ''],
  ['cd-back', ',\n   then a standalone `cd {main-checkout}` whatever the result, before any later step.', '.'],
  ['stamp-full', '`scope` is `full`, ', ''],
  ['failed-verify-keeps-wt', 'keep `{wt}`, and report it', 'and report `{wt}`'],
  ['plain-push', '`git -C {wt} push origin HEAD:{head}` — plain.', 'then force-push the branch.'],
  ['head-before-ci', 'Confirm `gh pr view {number} --json headRefOid` equals `{verified-sha}` — one re-read if it lags; a sha that still differs stops the candidate\n   (`stopped: update failed — head moved`), since one sha is never verified and another merged.\n   ', ''],
  ['head-run-first', 'so first repeat `_shared/pr-first-merge.md` Step 2.5\'s head-run read\n   (`gh run list --commit {verified-sha}`) until it lists a run — ', 'so wait — '],
  ['empty-runs-continue', '; still empty adds nothing (Step 2.5\'s empty-runs rule, e.g. no or path-filtered workflows),\n   so continue to the watch and step 1\'s read, which decide.', ', else `stopped: CI pending after update`.'],
  ['watch-timeout', ' as its own Bash call with an explicit long timeout (the tool\'s maximum)', ''],
  ['ci-step1', 're-run `close-out.md` step 1\'s read: only `passing` continues', 're-read CI'],
  ['head-after-ci', ',\n   and re-check `headRefOid` against `{verified-sha}` as above, since a push may have landed during the wait.', '.'],
  ['mergeability-reread', '   Last, re-run step 2\'s mergeability read. ', '   '],
  ['stop-set', 'The post-update stop set is `DIRTY`, `mergeable: CONFLICTING`, `BEHIND` (the base moved during the wait), a string result, or `null` —\n   each stops', 'A conflict stops'],
  ['unknown-bounded', 're-read it — up to 3 reads, a few seconds apart, each its own plain command — and stop only if still `UNKNOWN`', 'stop on it'],
  ['teardown-on-stop', '\n   and any stop on a resume or on `BEHIND` before step 4 passes, each of which keeps', ', which keeps'],
  ['teardown-next-run', 'the next run\'s step 2 resumes `{wt}`, or stops on it once the PR head has diverged', 'the next run resumes `{wt}`'],
  ['teardown', 'on exit 0, `git worktree remove {wt}`', 'on exit 0, leave it'],
  ['handoff-sha', '`{verified-sha}` itself (`close-out.md` step 5 merges only that head),\n   ', ''],
  ['handoff-resume-values', 'on a resume, as step 2 recovered them', '`unrecorded` on a resume'],
];

test('every close-out-update.md pin has exactly one go-red mutation', () => {
  assert.deepEqual(UPDATE_MUTATIONS.map(([id]) => id).sort(), UPDATE_PINS.map(([id]) => id).sort());
});

for (const [id, from, to] of UPDATE_MUTATIONS) {
  test(`go-red control: mutating only the ${id} clause fails the update-path assertions`, () => {
    assert.equal(UPDATE.split(from).length, 2, `the ${id} clause occurs exactly once`);
    const mutated = UPDATE.replace(from, to);
    assert.notEqual(mutated, UPDATE, 'the mutation must change the text');
    assert.throws(() => assertUpdateSteps(mutated), new RegExp(`pin ${id} `));
    assert.throws(() => assertUpdateRouting(STEP_2, mutated, CLOSE_OUT), new RegExp(`pin ${id} `));
  });
}

// close-out.md step 2 clauses: [label, exact text, replacement, expected message]
const STEP_2_MUTATIONS = [
  ['declining continues (M6)', 'declining continues, since\n   BEHIND was never a stop', 'BEHIND is now a stop', /declined BEHIND update continues/],
  ['existing update worktree resumes', 'routes to `close-out-update.md`\'s resume (its step 2) regardless of `mergeStateStatus`', 'is ignored', /routes to the resume/],
  ['rebase recommendation, any case', 'read `close-out-update.md` in this skill\'s directory', 'Rebase and re-verify first, or read `close-out-update.md` in this skill\'s directory', /rebase recommendation is gone/],
];

for (const [label, from, to, message] of STEP_2_MUTATIONS) {
  test(`go-red control: close-out step 2 without "${label}" fails the routing assertions`, () => {
    assert.equal(STEP_2.split(from).length, 2, `the ${label} clause occurs exactly once in step 2`);
    const mutated = STEP_2.replace(from, to);
    assert.notEqual(mutated, STEP_2, 'the mutation must change step 2');
    assert.throws(() => assertUpdateRouting(mutated, UPDATE, CLOSE_OUT), message);
  });
}

// AC2.1 at the merge itself: close-out step 5 re-reads the head and merges only the verified sha.
function assertMergeHeadCheck(closeOut) {
  const start = closeOut.indexOf('5. **On confirmation — merge.**');
  assert.ok(start >= 0, 'close-out step 5 found');
  const step5 = closeOut.slice(start, closeOut.indexOf('\n6. ', start));
  // Keyed on a handed-off sha, not on the update having run: a merge that brought in nothing hands off none.
  assert.match(step5, /When `close-out-update\.md` handed off a `\{verified-sha\}`, first re-read\s+`gh pr view \{number\} --json headRefOid` immediately before Step 3/, 'step 5 re-reads the head before Step 3');
  assert.match(step5, /any sha other than\s+that `\{verified-sha\}` \(`stopped: update failed — head moved`\)/, 'step 5 stops on a moved head');
  assert.match(step5, /pass `\{verified-sha\}`\s+as Step 3's expected head/, 'step 5 passes the verified sha as the expected head');
}

const MERGE = readText(path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'pr-first-merge.md'));

// pr-first-merge.md Step 3: the expected-head sentence sits right after its two opening fences.
function assertExpectedHeadSentence(merge) {
  const start = merge.indexOf('## Step 3: Attempt auto-merge');
  const tag = merge.indexOf('`{tag}` is `auto-merge`', start);
  assert.ok(start >= 0 && tag > start, 'Step 3 and its tag paragraph found');
  const head = merge.slice(start, tag);
  assert.match(head, /expected head sha[^\n]*append `--match-head-commit \{expected-head\}` to every `gh pr merge` command in this step[^\n]*callers that supply none are unchanged/,
    'Step 3 appends --match-head-commit for a caller-supplied expected head');
}

test('AC2.1: close-out step 5 merges only the verified head, via Step 3\'s --match-head-commit', () => {
  assertMergeHeadCheck(CLOSE_OUT);
  assertExpectedHeadSentence(MERGE);
});

test('go-red control: close-out step 5 without the head re-check fails', () => {
  const from = 'When `close-out-update.md` handed off a `{verified-sha}`, first re-read\n   `gh pr view {number} --json headRefOid` immediately before Step 3 and stop on any sha other than\n   that `{verified-sha}` (`stopped: update failed — head moved`); then pass `{verified-sha}`\n   as Step 3\'s expected head, so its `--match-head-commit` merges only that head.\n   ';
  assert.equal(CLOSE_OUT.split(from).length, 2, 'the head re-check occurs exactly once');
  assert.throws(() => assertMergeHeadCheck(CLOSE_OUT.replace(from, '')), /re-reads the head/);
});

test('go-red control: close-out step 5 keyed on the update having run, not on a handed-off sha, fails', () => {
  const from = 'When `close-out-update.md` handed off a `{verified-sha}`, first';
  assert.equal(CLOSE_OUT.split(from).length, 2, 'the trigger clause occurs exactly once');
  assert.throws(() => assertMergeHeadCheck(CLOSE_OUT.replace(from, 'When `close-out-update.md` ran, first')), /re-reads the head/);
});

test('go-red control: pr-first-merge Step 3 without the expected-head sentence fails', () => {
  const from = 'append `--match-head-commit {expected-head}` to every `gh pr merge` command in this step';
  assert.equal(MERGE.split(from).length, 2, 'the sentence occurs exactly once');
  assert.throws(() => assertExpectedHeadSentence(MERGE.replace(from, 'merge as usual')), /--match-head-commit/);
});

const CONFIRM = readText(path.join(__dirname, '..', 'plugin', 'skills', 'dispatch', 'close-out-confirmation.md'));

const CLAUSE_VALUES = ['{update-method}', '{conflicted-files}', '{resolution-commit}'];

// Asserts against the {update-clause} definition paragraph ALONE (to the next blank line):
// the "Source values live" paragraph below it names the same variables and must not satisfy these.
function assertUpdateClause(text) {
  const question = text.split('\n').find((l) => l.includes('`question`:'));
  assert.ok(question, 'question line found');
  assert.ok(question.includes('{update-clause}'), 'question carries {update-clause}');
  const from = text.indexOf('{update-clause}', text.indexOf(question) + question.length);
  assert.ok(from >= 0, '{update-clause} definition found after the question');
  const end = text.indexOf('\n\n', from);
  const def = text.slice(from, end < 0 ? undefined : end);
  for (const v of CLAUSE_VALUES) {
    assert.ok(def.includes(v), `{update-clause} definition names ${v}`);
  }
  assert.match(def, /close-out-update\.md/, 'values come from close-out-update.md, never re-derived');
  assert.match(def, /empty|omitted/i, 'no update → the clause is empty');
  // A resumed update ran in an earlier session, so the clause must not claim "this session".
  assert.match(def, /Updated from \{base\} by close-out via/, 'clause holds for a resumed update too');
  assert.doesNotMatch(def, /this session/, 'clause never claims the update ran this session');
}

test('go-red control: an update clause claiming "this session" fails AC3.1', () => {
  const from = 'Updated from {base} by close-out via';
  assert.equal(CONFIRM.split(from).length, 2, 'the clause wording occurs exactly once');
  assert.throws(() => assertUpdateClause(CONFIRM.replace(from, 'Updated from {base} this session via')), /resumed update too/);
});

test('AC3.1: the confirmation question names that an update ran, the conflicted files, and the resolution commit', () => {
  assertUpdateClause(CONFIRM);
});

for (const v of CLAUSE_VALUES) {
  test(`go-red control: dropping ${v} from the {update-clause} paragraph alone fails AC3.1`, () => {
    const q = CONFIRM.indexOf('`question`:');
    const from = CONFIRM.indexOf('{update-clause}', CONFIRM.indexOf('\n', q));
    const end = CONFIRM.indexOf('\n\n', from);
    const para = CONFIRM.slice(from, end);
    assert.ok(para.includes(v), `the clause paragraph names ${v} to begin with`);
    const mutated = CONFIRM.slice(0, from) + para.split(v).join('{dropped}') + CONFIRM.slice(end);
    assert.notEqual(mutated, CONFIRM, 'the mutation must change the text');
    assert.throws(() => assertUpdateClause(mutated), new RegExp(`names ${v.replace(/[{}]/g, '\\$&')}`));
  });
}

const SCAN = readText(path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'github-pr-scan.md'));

function assertItem11(scan) {
  const start = scan.indexOf('11. **Stale pending-review PR**');
  const end = scan.indexOf('Findings and recommendations', start);
  assert.ok(start >= 0 && end > start, 'item 11 locatable');
  const item11 = scan.slice(start, end);
  assert.ok(item11.includes('**Flag-only, never auto-rebase.**'), 'still flag-only');
  assert.ok(item11.includes('close-out-update.md'), 'names close-out\'s update path');
  assert.ok(!item11.includes('gh pr update-branch'), 'the sweep itself never updates');
  assert.ok(!/rebase and re-verify/i.test(scan), 'the [pr-stale] recommendation no longer says rebase');
}

test('AC5.1: github-pr-scan item 11 stays flag-only and points at close-out\'s update path', () => {
  assertItem11(SCAN);
});

test('go-red control: a capitalized rebase recommendation in github-pr-scan fails AC5.1', () => {
  const from = 'Update from the integration branch and re-verify';
  assert.equal(SCAN.split(from).length, 2, 'the [pr-stale] recommendation occurs exactly once');
  assert.throws(() => assertItem11(SCAN.replace(from, 'Rebase and re-verify')), /no longer says rebase/);
});

// After an update the gate's CI/mergeability values are the update's post-push re-reads.
function assertPostUpdateSourceValues(confirm) {
  const start = confirm.indexOf('**Source values live');
  assert.ok(start >= 0, 'Source values live paragraph found');
  const para = confirm.slice(start, confirm.indexOf('\n\n', start));
  assert.match(para, /After an update, `\{status\}` and `\{mergeable-summary\}` are `close-out-update\.md`\s+step 6's re-reads/, 'post-update values come from close-out-update.md step 6');
}

test('the confirmation gate reads post-update CI and mergeability from close-out-update.md step 6', () => {
  assertPostUpdateSourceValues(CONFIRM);
});

test('go-red control: the confirmation gate without the post-update source rule fails', () => {
  const from = 'After an update, `{status}` and `{mergeable-summary}` are `close-out-update.md`\nstep 6\'s re-reads (the latest read), never steps 1-2\'s pre-update values, which describe a head the\nupdate replaced. ';
  assert.equal(CONFIRM.split(from).length, 2, 'the rule occurs exactly once');
  assert.throws(() => assertPostUpdateSourceValues(CONFIRM.replace(from, '')), /step 6/);
});
