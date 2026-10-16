// tests/hooks-manifest-init.test.js — the `node bin/hooks.js manifest-init`
// CLI wrapper (#3035): the sanctioned writer of the INITIAL manifest.yml, so
// a multi-spec run's first `spec-status --status running` call has a file
// to transition rather than refusing with `no-manifest`.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readManifest } = require('../plugin/bin/lib/flow/manifest');

const HOOKS = path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js');
const HOOK_SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-manifestinit-sandbox-'));

function runHook(args, { input = '', cwd = HOOK_SANDBOX, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], {
      input, cwd, encoding: 'utf8', env: { ...process.env, PIPELINE_RUN_DIR: '', ...env },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

function freshRunDir() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-manifestinit-'));
  execFileSync('git', ['-C', project, 'init', '-q']);
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-10-16T000000-spec-1-2-3');
  fs.mkdirSync(run, { recursive: true });
  // #1566: resolveRunArg requires an initialized run dir — manifest-init is
  // itself the FIRST write for a fresh multi-spec run, so it needs the same
  // marker-file exception spec-status's own fixture carries.
  fs.writeFileSync(path.join(run, 'decisions.md'), '');
  return run;
}

test('manifest-init on a fresh run dir creates manifest.yml with every spec at pending', () => {
  const run = freshRunDir();
  assert.equal(readManifest(run), null);
  const r = runHook(['manifest-init', '--run', run, '--specs', '1,2,3'], { cwd: run });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /manifest initialized/);
  const manifest = readManifest(run);
  assert.deepEqual(manifest.multispec.specs.map((s) => s.id), [1, 2, 3]);
  for (const s of manifest.multispec.specs) assert.equal(s.status, 'pending');
});

test('manifest-init accepts --base-sha and writes it once', () => {
  const run = freshRunDir();
  runHook(['manifest-init', '--run', run, '--specs', '1', '--base-sha', 'f9b5ec84'], { cwd: run });
  assert.equal(readManifest(run).multispec.baseSha, 'f9b5ec84');
});

test('manifest-init followed by spec-status succeeds — the exact failure this record reports', () => {
  const run = freshRunDir();
  runHook(['manifest-init', '--run', run, '--specs', '1,2'], { cwd: run });
  const r = runHook(['spec-status', '--run', run, '--spec', '1', '--status', 'running', '--phase', 'build'], { cwd: run });
  assert.match(r.stdout, /^## Flow: Running build \(1\/2\) — spec #1\n/);
});

test('manifest-init with no --specs is a malformed invocation (nothing written)', () => {
  const run = freshRunDir();
  const r = runHook(['manifest-init', '--run', run], { cwd: run });
  assert.match(r.stdout, /manifest not initialized/);
  assert.equal(readManifest(run), null);
});

test('spec-status\'s no-manifest refusal names the manifest-init command', () => {
  const run = freshRunDir();
  const r = runHook(['spec-status', '--run', run, '--spec', '1', '--status', 'running', '--phase', 'build'], { cwd: run });
  assert.match(r.stdout, /manifest-init --run/);
});
