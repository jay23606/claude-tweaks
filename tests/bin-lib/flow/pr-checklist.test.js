// tests/bin-lib/flow/pr-checklist.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { composePrEarlyBody } = require('../../../plugin/bin/lib/flow/pr-body');
const { setPhaseRow, firstLineRunId, readRunReversals } = require('../../../plugin/bin/lib/flow/pr-checklist');

const body = composePrEarlyBody({
  runId: 'R1', specSummary: 'S', target: '#1', nextStep: 'build', fixesLines: ['Fixes #1'],
});

test('AC1.1: flipping build changes only that row', () => {
  const out = setPhaseRow({ body, phase: 'build' });
  assert.equal(out.changed, true);
  assert.equal(out.row, 'checked');
  assert.equal(out.body, body.replace('- [ ] build', '- [x] build'));
});

test("AC1.1: --remove deletes only that row's line", () => {
  const out = setPhaseRow({ body, phase: 'polish', remove: true });
  assert.equal(out.changed, true);
  assert.equal(out.row, 'removed');
  assert.equal(out.body, body.replace('- [ ] polish\n', ''));
});

test('already-checked row is a no-op', () => {
  const first = setPhaseRow({ body, phase: 'build' });
  const second = setPhaseRow({ body: first.body, phase: 'build' });
  assert.equal(second.changed, false);
  assert.equal(second.row, 'already-checked');
  assert.equal(second.body, first.body);
});

test('removing an absent row is a no-op', () => {
  const first = setPhaseRow({ body, phase: 'polish', remove: true });
  const second = setPhaseRow({ body: first.body, phase: 'polish', remove: true });
  assert.equal(second.changed, false);
  assert.equal(second.row, 'row-absent');
  assert.equal(second.body, first.body);
});

test('flipping an absent row is a no-op', () => {
  const removed = setPhaseRow({ body, phase: 'polish', remove: true });
  const out = setPhaseRow({ body: removed.body, phase: 'polish' });
  assert.equal(out.changed, false);
  assert.equal(out.row, 'row-absent');
  assert.equal(out.body, removed.body);
});

test('CRLF body keeps its carriage returns', () => {
  const crlf = body.replace(/\n/g, '\r\n');
  const out = setPhaseRow({ body: crlf, phase: 'build' });
  assert.equal(out.row, 'checked');
  assert.equal(out.body, crlf.replace('- [ ] build\r', '- [x] build\r'));
});

test('exact phase match only', () => {
  const withSmoke = body.replace('- [ ] test\n', '- [ ] test\n- [ ] test-smoke\n');
  const out = setPhaseRow({ body: withSmoke, phase: 'test' });
  assert.equal(out.row, 'checked');
  assert.ok(out.body.includes('- [x] test\n'));
  assert.ok(out.body.includes('- [ ] test-smoke\n'));
});

test('rows outside the span are untouched', () => {
  const withTail = `${body}\n- [ ] build\n`;
  const out = setPhaseRow({ body: withTail, phase: 'build' });
  assert.equal(out.row, 'checked');
  assert.equal(out.body, withTail.replace('- [ ] build', '- [x] build'));
  assert.ok(out.body.endsWith('\n- [ ] build\n'));
});

test('plain-text-only span is used', () => {
  const plainOnly = body.replace('<!-- phases-start -->\n', '').replace('<!-- phases-end -->\n', '');
  assert.ok(!plainOnly.includes('<!-- phases-'));
  const out = setPhaseRow({ body: plainOnly, phase: 'build' });
  assert.equal(out.row, 'checked');
  assert.equal(out.body, plainOnly.replace('- [ ] build', '- [x] build'));
});

test('no phases span reports no-phases-span', () => {
  assert.deepEqual(
    setPhaseRow({ body: 'hello\n', phase: 'build' }),
    { changed: false, row: 'no-phases-span', body: 'hello\n' },
  );
});

test('unknown phase throws', () => {
  assert.throws(() => setPhaseRow({ body, phase: 'deploy' }), /unknown phase/);
});

test('firstLineRunId reads either marker form', () => {
  assert.equal(firstLineRunId(body), 'R1');
  assert.equal(firstLineRunId('claude-tweaks-run: R2\nx'), 'R2');
  assert.equal(firstLineRunId('<!-- claude-tweaks-run: R3 -->\r\nx'), 'R3');
  assert.equal(firstLineRunId('text\n<!-- claude-tweaks-run: R1 -->'), null);
});

test("readRunReversals reads a bundle's per-spec decisions.md files", () => {
  const runDir = path.join('tmp-run', 'R1');
  const line = '- AUTO 10:00:00 — /build: premise reversed: A → B. Reversibility: n/a.';
  const read = [];
  const readFile = (p) => {
    read.push(p);
    if (p === path.join(runDir, 'spec-2', 'decisions.md')) return `${line}\n`;
    throw new Error('ENOENT');
  };
  const bundle = readRunReversals(runDir, {
    readFile,
    readManifest: () => ({ multispec: { specs: [{ id: 1 }, { id: 2 }] } }),
  });
  assert.deepEqual(bundle, [{ original: 'A', replacement: 'B' }]);
  assert.deepEqual(read, [path.join(runDir, 'spec-1', 'decisions.md'), path.join(runDir, 'spec-2', 'decisions.md')]);

  const single = [];
  readRunReversals(runDir, {
    readFile: (p) => { single.push(p); return ''; },
    readManifest: () => null,
  });
  assert.deepEqual(single, [path.join(runDir, 'decisions.md')]);
});
