// tests/hooks-pr-merge-state.test.js — the `node bin/hooks.js pr-merge-state`
// CLI wrapper (#2986): a mechanical, best-effort, fail-open read of a run's
// PR mergeable/mergeStateStatus, so _shared/git-discipline.md's phase-exit
// push can notice a conflicting PR without an agent-composed `gh` call.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js');

// Same technique tests/bin-lib/reconcile/pr-state.test.js uses: resolvePrStateByNumber
// shells to `gh` with no injectable deps, so intercept at the process-spawn
// boundary via a `gh` wrapper placed first on PATH.
function installGhWrapper(jsonOrScript) {
  const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-merge-state-ghwrap-'));
  const wrapperPath = path.join(wrapperDir, 'gh');
  const body = typeof jsonOrScript === 'string' && jsonOrScript.startsWith('#!')
    ? jsonOrScript
    : `#!/bin/sh\ncat <<'EOF'\n${JSON.stringify(jsonOrScript)}\nEOF\n`;
  fs.writeFileSync(wrapperPath, body);
  fs.chmodSync(wrapperPath, 0o755); // root-safe: makes a spy script executable, not a permission-denial simulation
  return wrapperDir;
}

function runDirWithPr(prNumber) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-prmergestate-'));
  execFileSync('git', ['-C', project, 'init', '-q']);
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-10-16T000000-record-1');
  fs.mkdirSync(run, { recursive: true });
  const state = { worktree: project, status: 'active' };
  if (prNumber) state.pr = { number: prNumber, url: `https://x/pull/${prNumber}` };
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return run;
}

function runHook(args, { wrapperDir = null, cwd } = {}) {
  const PATH = wrapperDir ? `${wrapperDir}${path.delimiter}${process.env.PATH}` : process.env.PATH;
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], {
      cwd, encoding: 'utf8', env: { ...process.env, PATH, PIPELINE_RUN_DIR: '' },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

test('pr-merge-state: a run with no pr object returns {ok:true, pr:null}', () => {
  const run = runDirWithPr(null);
  const r = runHook(['pr-merge-state', '--run', run], { cwd: run });
  assert.deepStrictEqual(JSON.parse(r.stdout), { ok: true, pr: null });
});

test('pr-merge-state: reports mergeable and mergeStateStatus from gh pr view', () => {
  const run = runDirWithPr(42);
  const wrapperDir = installGhWrapper({
    number: 42, state: 'OPEN', mergedAt: null, updatedAt: '2026-01-01T00:00:00Z', mergeCommit: null, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY',
  });
  const r = runHook(['pr-merge-state', '--run', run], { wrapperDir, cwd: run });
  assert.deepStrictEqual(JSON.parse(r.stdout), { ok: true, pr: { number: 42, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' } });
});

test('pr-merge-state: a gh call that fails (malformed output) degrades to {ok:true, pr:null, degraded:"network-failure"}, never throws (#2986)', () => {
  const run = runDirWithPr(42);
  const wrapperDir = installGhWrapper('#!/bin/sh\necho "not json"\n');
  const r = runHook(['pr-merge-state', '--run', run], { wrapperDir, cwd: run });
  assert.strictEqual(r.code, 0);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.pr, null);
  assert.strictEqual(parsed.degraded, 'network-failure');
});

test('pr-merge-state: an unresolvable --run exits 0 with {ok:false}', () => {
  const r = runHook(['pr-merge-state', '--run', '/nonexistent-run-dir-xyz'], { cwd: os.tmpdir() });
  assert.strictEqual(r.code, 0);
  assert.strictEqual(JSON.parse(r.stdout).ok, false);
});
