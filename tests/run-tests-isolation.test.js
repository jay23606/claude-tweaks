// tests/run-tests-isolation.test.js
//
// #3969: running many full suites at once (sibling worktrees, sessions) overloaded the dev
// machine. tools/run-tests.js bounds its own load: `--test-concurrency` defaults to half the
// cores (CT_TEST_CONCURRENCY overrides) and a cross-process slot semaphore caps simultaneous
// suites (CT_TEST_SUITE_SLOTS). This pins the pure helpers; `platform`/`nodeMajor`/`env` are
// parameters, never a stubbed `process` in this process.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { resolveConcurrency, resolveSlots, listTestFiles, buildTestArgs } = require(path.join(ROOT, 'tools', 'run-tests.js'));

test('resolveConcurrency defaults to half the cores, at least 1', () => {
  assert.strictEqual(resolveConcurrency({}, 12), 6);
  assert.strictEqual(resolveConcurrency({}, 1), 1);
  assert.strictEqual(resolveConcurrency({}, 3), 1);
});

test('resolveConcurrency honors a positive-integer CT_TEST_CONCURRENCY', () => {
  assert.strictEqual(resolveConcurrency({ CT_TEST_CONCURRENCY: '3' }, 12), 3);
});

test('resolveConcurrency ignores an invalid CT_TEST_CONCURRENCY', () => {
  for (const bad of ['0', '-2', 'abc', '2.5']) {
    assert.strictEqual(resolveConcurrency({ CT_TEST_CONCURRENCY: bad }, 12), 6, bad);
  }
});

test('resolveSlots defaults to 1', () => {
  const lines = [];
  assert.strictEqual(resolveSlots({}, (l) => lines.push(l)), 1);
  assert.deepStrictEqual(lines, []);
});

test('resolveSlots honors CT_TEST_SUITE_SLOTS=3', () => {
  assert.strictEqual(resolveSlots({ CT_TEST_SUITE_SLOTS: '3' }, () => {}), 3);
});

test('resolveSlots: an invalid value falls back to 1 and logs one line naming CT_TEST_SUITE_SLOTS', () => {
  for (const bad of ['0', '-2', 'abc', '2.5']) {
    const lines = [];
    assert.strictEqual(resolveSlots({ CT_TEST_SUITE_SLOTS: bad }, (l) => lines.push(l)), 1, bad);
    assert.strictEqual(lines.length, 1, bad);
    assert.match(lines[0], /CT_TEST_SUITE_SLOTS/);
  }
});

test('listTestFiles accepts an absolute root', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-tests-abs-root-'));
  try {
    fs.writeFileSync(path.join(tmp, 'a.test.js'), '');
    fs.writeFileSync(path.join(tmp, 'b.js'), '');
    assert.deepStrictEqual(listTestFiles(ROOT, [tmp]), [path.join(tmp, 'a.test.js')]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('buildTestArgs rejects a non-positive-integer concurrency; a valid one still reaches the win32/Node 20 error', () => {
  for (const bad of [undefined, 0, -1, 2.5, '4', NaN]) {
    assert.throws(() => buildTestArgs([], [], { platform: 'linux', nodeMajor: 22, concurrency: bad }), /concurrency/, String(bad));
  }
  assert.throws(() => buildTestArgs([], ['tests'], { platform: 'win32', nodeMajor: 20, concurrency: 4 }), /Node >= 22/);
});
