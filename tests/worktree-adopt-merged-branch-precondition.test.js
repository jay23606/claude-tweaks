'use strict';
// #3572: a clean worktree whose branch's PR already merged must not be adopted — the
// Adopt-or-create gate falls through to Not isolated, and the merged check is spelled out
// in _shared/worktree-setup.md so every consumer that restates the adopt condition agrees.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { readText } = require('./helpers/read-skill');

const ROOT = path.join(__dirname, '..');
const read = (...p) => readText(path.join(ROOT, ...p));

const SHARED_WORKTREE_SETUP = read('plugin', 'skills', '_shared', 'worktree-setup.md');
const BUILD_WORKTREE_SETUP = read('plugin', 'skills', 'build', 'worktree-setup.md');
const ROUTINE_CREATE_AND_UPDATE = read('plugin', 'skills', 'routine', 'create-and-update.md');
const MULTI_SPEC = read('plugin', 'skills', 'flow', 'multi-spec.md');

function region() {
  const start = SHARED_WORKTREE_SETUP.indexOf('## Adopt-or-create');
  const end = SHARED_WORKTREE_SETUP.indexOf('## Pre-creation reconcile', start);
  assert.notStrictEqual(start, -1, '## Adopt-or-create heading missing from _shared/worktree-setup.md');
  assert.notStrictEqual(end, -1, '## Pre-creation reconcile heading missing — this test has lost its anchor');
  return SHARED_WORKTREE_SETUP.slice(start, end);
}

test('Adopt-or-create names the merged-branch precondition', () => {
  const r = region();
  assert.ok(r.includes('**Merged-branch precondition (clean tree only).**'));
  assert.ok(r.includes('--state merged'));
});

test('the git-only check is an ancestor not on the first-parent line', () => {
  const r = region();
  assert.ok(r.includes('git merge-base --is-ancestor HEAD origin/{integration-branch}'));
  assert.ok(r.includes('git rev-list --first-parent origin/{integration-branch}'));
});

test('a merged branch falls through like a dirty tree', () => {
  const r = region();
  assert.ok(r.includes('fall through to **Not isolated** via `ExitWorktree(action: "keep")` exactly as a dirty tree does'));
});

test('the check fails open and logs its path', () => {
  const r = region();
  assert.ok(r.includes('a squash-merged branch adopts as before (fail open)'));
});

test('the adopt condition cites the precondition', () => {
  const r = region();
  assert.ok(r.includes('and the branch passes the merged-branch precondition below'));
});

test('consumers restate the narrowed adopt condition', () => {
  assert.ok(MULTI_SPEC.includes('(already isolated, clean tree, branch not merged)'));
  assert.ok(MULTI_SPEC.includes('(not isolated, dirty, or on a merged branch)'));
  assert.ok(BUILD_WORKTREE_SETUP.includes('branch (not isolated, dirty, or on a merged branch)'));
  assert.ok(BUILD_WORKTREE_SETUP.includes('branch (already isolated, clean tree, branch not merged'));
  assert.ok(ROUTINE_CREATE_AND_UPDATE.includes('already isolated (with a clean tree on an unmerged branch)'));
});
