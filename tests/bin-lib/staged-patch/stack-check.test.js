// tests/bin-lib/staged-patch/stack-check.test.js — #3290's staging-time stacked check: apply-order
// conflict attribution. Every patch is a real `git diff` captured in a throwaway fixture repo
// (edit f.txt, capture the diff, restore f.txt with git checkout inside that fixture) — never
// hand-typed hunks.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { FIXTURE_TIMEOUT_MS } = require('../../helpers/git-fixtures');
const { checkStack, stagedApplyOrder } = require('../../../plugin/bin/lib/staged-patch/stack-check');

const FIXTURE_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const BASE = ['l1', 'l2', 'l3', 'l4', 'anchor', 'a1', 'a2', 'a3'].join('\n') + '\n';
const PREAMBLE = 'Target: f.txt\nInvariant: x\n\n';

function gitFixture(t, content = BASE) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', timeout: FIXTURE_TIMEOUT_MS, env: FIXTURE_ENV });
  const runOk = (...args) => {
    const r = git(...args);
    assert.equal(r.status, 0, r.stderr);
    return r;
  };
  runOk('init', '-q');
  runOk('config', 'user.email', 'stack-check@example.invalid');
  runOk('config', 'user.name', 'stack-check');
  fs.writeFileSync(path.join(dir, 'f.txt'), content);
  runOk('add', 'f.txt');
  runOk('commit', '-q', '-m', 'base');
  return { dir, git, runOk };
}

// Edit f.txt in a fixture whose HEAD is `base`, capture `git diff`, then restore f.txt.
function captureDiff(t, base, edit) {
  const fx = gitFixture(t, base);
  fs.writeFileSync(path.join(fx.dir, 'f.txt'), edit(base));
  const d = fx.git('diff');
  assert.equal(d.status, 0, d.stderr);
  fx.runOk('checkout', '--', 'f.txt');
  return d.stdout;
}

function stagedDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-check-staged-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function stage(dir, name, diff) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, PREAMBLE + diff);
  return file;
}

const insertAboveAnchor = (tag) => (text) => text.replace('anchor\n', `${tag}a\n${tag}b\nanchor\n`);
const editLine = (from, to) => (text) => text.replace(`${from}\n`, `${to}\n`);

test('AC1.1: two patches inserting above the same anchor are reported naming both', (t) => {
  const fx = gitFixture(t);
  const dir = stagedDir(t);
  const r1 = stage(dir, 'review-1.patch', captureDiff(t, BASE, insertAboveAnchor('new1')));
  const r2 = stage(dir, 'review-2.patch', captureDiff(t, BASE, insertAboveAnchor('new2')));
  const r = checkStack({ worktree: fx.dir, patches: [r1, r2], target: r2 });
  assert.equal(r.ok, false);
  assert.equal(r.targetConflict.patch, 'review-2.patch');
  assert.equal(r.targetConflict.conflictsWith, 'review-1.patch');
  assert.match(r.targetConflict.error, /patch failed|does not apply/);
});

test('AC2.1: patches on separate regions stack cleanly', (t) => {
  const fx = gitFixture(t);
  const dir = stagedDir(t);
  const r1 = stage(dir, 'review-1.patch', captureDiff(t, BASE, editLine('l1', 'l1-edit')));
  const r2 = stage(dir, 'review-2.patch', captureDiff(t, BASE, editLine('a3', 'a3-edit')));
  const r = checkStack({ worktree: fx.dir, patches: [r1, r2], target: r2 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.skipped, []);
});

test('AC1.1: order — a new patch sorting first is still caught', (t) => {
  const fx = gitFixture(t);
  const dir = stagedDir(t);
  stage(dir, 'review-2.patch', captureDiff(t, BASE, insertAboveAnchor('new2')));
  const p10 = stage(dir, 'review-10.patch', captureDiff(t, BASE, insertAboveAnchor('new10')));
  const patches = stagedApplyOrder(['review-2.patch', 'review-10.patch']).map((n) => path.join(dir, n));
  const r = checkStack({ worktree: fx.dir, patches, target: p10 });
  assert.deepEqual(r.order, ['review-10.patch', 'review-2.patch']);
  assert.equal(r.targetConflict.patch, 'review-2.patch');
  assert.equal(r.targetConflict.conflictsWith, 'review-10.patch');
});

test('a patch that fails alone is skipped, not a conflict', (t) => {
  const fx = gitFixture(t);
  const dir = stagedDir(t);
  const mid = BASE.replace('a3\n', 'a3-mid\n');
  const r1 = stage(dir, 'review-1.patch', captureDiff(t, BASE, editLine('l1', 'l1-edit')));
  const r3 = stage(dir, 'review-3.patch', captureDiff(t, mid, editLine('a3-mid', 'a3-new')));
  const r = checkStack({ worktree: fx.dir, patches: [r1, r3], target: r1 });
  assert.deepEqual(r.skipped.map((s) => s.patch), ['review-3.patch']);
  assert.match(r.skipped[0].error, /patch failed|does not apply/);
  assert.deepEqual(r.conflicts, []);
});

test('worktree untouched: the check leaves git status clean and f.txt at its base bytes', (t) => {
  const fx = gitFixture(t);
  const dir = stagedDir(t);
  const r1 = stage(dir, 'review-1.patch', captureDiff(t, BASE, insertAboveAnchor('new1')));
  const r2 = stage(dir, 'review-2.patch', captureDiff(t, BASE, insertAboveAnchor('new2')));
  checkStack({ worktree: fx.dir, patches: [r1, r2], target: r2 });
  assert.equal(fx.git('status', '--porcelain').stdout, '');
  assert.equal(fs.readFileSync(path.join(fx.dir, 'f.txt'), 'utf8'), BASE);
});

test('stagedApplyOrder sorts byte-wise and drops non-patches', () => {
  assert.deepEqual(stagedApplyOrder(['review-2.patch', 'x.md', 'review-10.patch']), ['review-10.patch', 'review-2.patch']);
});
