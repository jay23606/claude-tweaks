// tests/materialize-design-intent.test.js
//
// #3018: bin/materialize.js hard-fails (exit 1, no file written) when a
// record's Design-intent: line names a value outside the policy enum or
// combines `none` with another intent. A multi-value list materializes as
// the normalized comma-joined string. Harness shape follows
// tests/materialize-record-json.test.js (fakeDepsNoGh + gitRepo fixture).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { gitRepo } = require('./helpers/git-fixtures');
const wtDetect = require('../plugin/bin/lib/hooks/worktree-detect');
const { run } = require('../plugin/bin/materialize');

const N = 3018;

function shapedBody(designIntentLine) {
  return [
    'Surface: web',
    designIntentLine,
    '',
    '## Current State',
    'Some current state text.',
    '',
    '## Deliverables',
    '- [ ] do a thing',
    '',
    '## Acceptance Criteria',
    '1. It works',
    '',
    '## Release Note',
    'Fixed the thing.',
  ].join('\n');
}

function withCwd(dir, fn) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return fn(); } finally { process.chdir(prev); }
}

function fakeDepsNoGh() {
  const stdout = [];
  const stderr = [];
  return {
    calls: { stdout, stderr },
    ghAvailable: () => { throw new Error('ghAvailable should never be called when --record-json is passed'); },
    ghView: () => { throw new Error('ghView should never be called when --record-json is passed'); },
    remoteUrl: () => { throw new Error('remoteUrl should never be called when --record-json is passed'); },
    readFile: (file) => fs.readFileSync(file, 'utf8'),
    cwd: () => process.cwd(),
    mainRoot: (cwd) => wtDetect.mainCheckoutRoot(cwd),
    isAnchored: (resolvedPath, mainRoot) => wtDetect.isAnchoredUnderRoot(resolvedPath, mainRoot),
    cwdWorktreeRoot: (cwd) => {
      const info = wtDetect.repoInfo(cwd);
      return info.isLinkedWorktree ? info.repoRoot : null;
    },
    mkdirp: (dir) => fs.mkdirSync(dir, { recursive: true }),
    writeFile: (file, content) => fs.writeFileSync(file, content),
    stdout: (s) => stdout.push(s),
    stderr: (s) => stderr.push(s),
    gitRevListCount: () => { throw new Error('gitRevListCount should not be called — no stamp on this record'); },
    gitCommitDate: () => { throw new Error('gitCommitDate should not be called — no stamp on this record'); },
  };
}

function materializeWithBody(body) {
  const repo = gitRepo();
  return withCwd(repo, () => {
    const recordFile = path.join(repo, 'record.json');
    fs.writeFileSync(recordFile, JSON.stringify({
      number: N,
      title: 'Design-intent record',
      body,
      labels: [{ name: 'ceremony:standard' }],
      url: 'https://example.invalid/3018',
    }));
    const deps = fakeDepsNoGh();
    const runDir = path.join(repo, '.claude-tweaks', 'pipelines', '2026-01-01T000000-record-3018');
    const exitCode = run([String(N), '--run-dir', runDir, '--record-json', recordFile], deps);
    return { exitCode, deps, runDir };
  });
}

test('two-value Design-intent materializes as "design-intent: quiet, minimal" (#3018)', () => {
  const { exitCode, deps } = materializeWithBody(shapedBody('Design-intent: quiet, minimal'));
  const stderr = deps.calls.stderr.join('');
  assert.strictEqual(exitCode, 0, stderr);
  const envelope = JSON.parse(deps.calls.stdout.join(''));
  const written = fs.readFileSync(envelope.file, 'utf8');
  assert.match(written, /^design-intent: quiet, minimal$/m);
});

test('unknown Design-intent value exits 1 naming the record and value, writes nothing (#3018)', () => {
  const { exitCode, deps, runDir } = materializeWithBody(shapedBody('Design-intent: quiet, sparkly'));
  assert.strictEqual(exitCode, 1);
  const stderr = deps.calls.stderr.join('');
  assert.match(stderr, new RegExp(`Record #${N}`));
  assert.ok(stderr.includes('sparkly'), `expected stderr to name the bad value: ${stderr}`);
  assert.strictEqual(fs.existsSync(path.join(runDir, 'work')), false, 'no work/ file should be written');
  assert.strictEqual(deps.calls.stdout.join(''), '', 'no success envelope should be printed');
});

test('none mixed with another intent exits 1 (#3018)', () => {
  const { exitCode, deps, runDir } = materializeWithBody(shapedBody('Design-intent: none, bold'));
  assert.strictEqual(exitCode, 1);
  const stderr = deps.calls.stderr.join('');
  assert.ok(stderr.includes('"none" cannot be combined'), `expected none-mixed detail: ${stderr}`);
  assert.strictEqual(fs.existsSync(path.join(runDir, 'work')), false, 'no work/ file should be written');
});
