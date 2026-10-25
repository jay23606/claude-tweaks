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

function assertUpdateRouting(step2, update, closeOut) {
  // AC1.1 — DIRTY/CONFLICTING and BEHIND route to the update offer, not only a stop
  const dirtySpan = routingSpan(step2, '`mergeStateStatus: DIRTY`', '`mergeStateStatus: BEHIND`');
  const behindSpan = routingSpan(step2, '`mergeStateStatus: BEHIND`', '`mergeStateStatus: BLOCKED`');
  assert.ok(dirtySpan.includes('close-out-update.md'), 'AC1.1: the DIRTY paragraph itself routes to close-out-update.md');
  assert.match(dirtySpan, /CONFLICTING/, 'AC1.1: mergeable CONFLICTING is treated like DIRTY');
  assert.ok(behindSpan.includes('close-out-update.md'), 'AC1.1: the BEHIND clause itself routes to close-out-update.md');
  assert.ok(!step2.includes('rebase and re-verify'), 'AC1.1: the old rebase recommendation is gone from step 2');
  // AC1.2 — declining leaves the PR exactly as it was
  assert.match(update, /[Dd]eclin[\s\S]{0,200}exactly as it was/, 'AC1.2: declining leaves the PR exactly as it was');
  // AC2.1 — full-suite verify.js stamp on the new HEAD + green CI on that HEAD
  assert.ok(update.includes('verify.js') && update.includes('--stamp-status'), 'AC2.1: verify.js run and stamp read');
  assert.match(update, /verifiedHead[\s\S]{0,200}scope[\s\S]{0,40}full/, 'AC2.1: stamp must be verifiedHead + scope full');
  assert.match(update, /headRefOid/, 'AC2.1: CI read is tied to the PR head SHA');
  assert.ok(update.includes('gh pr checks') && update.includes('--watch'), 'AC2.1: waits for the new HEAD\'s checks');
  assert.match(update, /step 1/i, 'AC2.1: re-runs close-out step 1 on the new HEAD');
  assert.match(update, /sha[\s\S]{0,80}rev-parse HEAD/, 'AC2.1: stamp sha equals the new HEAD');
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
  assert.match(UPDATE, /\.worktrees\/close-out-\{number\}/, 'own detached worktree under .worktrees/');
  assert.match(UPDATE, /--detach/, 'detached at origin/{head}, never the branch the run worktree may hold');
  assert.match(UPDATE, /git worktree remove/, 'torn down with git worktree remove (ExitWorktree does not operate on .worktrees/)');
  assert.match(UPDATE, /lockfile/i, 'installs dependencies before verifying');
  assert.match(UPDATE, /BEHIND[\s\S]{0,400}continue/i, 'a declined BEHIND update continues to step 3 as before');
});

const CONFIRM = readText(path.join(__dirname, '..', 'plugin', 'skills', 'dispatch', 'close-out-confirmation.md'));

test('AC3.1: the confirmation question names that an update ran, the conflicted files, and the resolution commit', () => {
  const question = CONFIRM.split('\n').find((l) => l.includes('`question`:'));
  assert.ok(question, 'question line found');
  assert.ok(question.includes('{update-clause}'), 'question carries {update-clause}');
  const def = CONFIRM.slice(CONFIRM.indexOf('{update-clause}', CONFIRM.indexOf(question) + question.length));
  for (const v of ['{update-method}', '{conflicted-files}', '{resolution-commit}']) {
    assert.ok(def.includes(v), `{update-clause} definition names ${v}`);
  }
  assert.match(def, /close-out-update\.md/, 'values come from close-out-update.md, never re-derived');
  assert.match(def, /empty|omitted/i, 'no update → the clause is empty');
});
