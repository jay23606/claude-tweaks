// tests/multispec-ephemeral-server-record-conformance.test.js — pins #3656: in a multi-spec
// /flow run each spec's {run-dir} is {parent}/spec-{N}/, but the specs share one dev server, so
// ephemeral-server.txt must live at one run-wide place. dev-url-detection.md's Ephemeral server
// start item 4 is the single definition of that "server record"; dispatch's task-prompt templates
// write and re-check the bundle parent, never a spec-{N}/ subdirectory.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.join(__dirname, '..', 'plugin', 'skills');
const read = (...p) => fs.readFileSync(path.join(SKILLS, ...p), 'utf8');

function section(text, heading) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const next = text.indexOf('\n## ', start + 1);
  return text.slice(start, next === -1 ? text.length : next);
}

// `### ` sections: slice to the next `### ` or `## ` heading.
function subsection(text, heading) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const rest = text.slice(start + 1);
  const m = rest.search(/\n##+ /);
  return m === -1 ? text.slice(start) : text.slice(start, start + 1 + m);
}

function lineStarting(text, prefix) {
  const line = text.split('\n').find((l) => l.startsWith(prefix));
  assert.ok(line, `missing line starting: ${prefix}`);
  return line;
}

// Template prose hard-wraps mid-sentence; compare on single-space-joined text.
const flat = (s) => s.replace(/\s+/g, ' ');

// The fenced blocks of a markdown file, in order (bodies only).
function fencedBlocks(text) {
  const blocks = [];
  let cur = null;
  for (const l of text.split('\n')) {
    if (l.startsWith('```')) {
      if (cur === null) cur = [];
      else { blocks.push(cur.join('\n')); cur = null; }
    } else if (cur !== null) cur.push(l);
  }
  return blocks;
}

// The blank-line-delimited paragraph of `block` that starts with `marker`.
function paragraph(block, marker) {
  const start = block.indexOf(marker);
  assert.notEqual(start, -1, `missing paragraph: ${marker}`);
  const m = block.slice(start).search(/\r?\n\r?\n/); // CRLF checkouts (#3574)
  return m === -1 ? block.slice(start) : block.slice(start, start + m);
}

test('AC3.1: dev-url-detection item 4 defines the server record with the single-spec fallback', () => {
  const dud = read('_shared', 'dev-url-detection.md');
  const item4 = lineStarting(dud, '4. **Record the PID + port + detach state**');
  for (const needle of [
    'server record',
    '`$MULTISPEC_PARENT_DIR/ephemeral-server.txt`',
    '`{run-dir}/ephemeral-server.txt`',
    'every reader resolves this same path',
  ]) {
    assert.ok(item4.includes(needle), `item 4 must include: ${needle}`);
  }
  assert.ok(
    !item4.includes('> "{run-dir}/ephemeral-server.txt"'),
    'the printf example must redirect to "{server-record}", not a raw {run-dir} path',
  );
  assert.ok(item4.includes('> "{server-record}"'), 'the printf example redirects to "{server-record}"');
});

test('dev-url-detection Cleanup reads the server record', () => {
  const dud = read('_shared', 'dev-url-detection.md');
  const cleanup = subsection(dud, '### Cleanup');
  const bullet = lineStarting(cleanup, '- **In a pipeline**');
  assert.ok(bullet.includes('server record'), 'the In a pipeline bullet must name the server record');
});

test('dispatch templates write and re-check the bundle parent, never a spec-{N}/ dir', () => {
  const blocks = fencedBlocks(read('dispatch', 'task-prompt.md'));
  assert.equal(blocks.length, 2, 'task-prompt.md keeps exactly two fenced templates');
  const markers = ['Ephemeral dev server (only if', 'Ephemeral dev server liveness'];
  blocks.forEach((block, i) => {
    const para = flat(paragraph(block, markers[i]));
    // Bare path: template 1 names it inside the printf redirect's quotes, template 2 in backticks.
    assert.ok(para.includes('{minted-run-dir}/ephemeral-server.txt'),`template ${i + 1} paragraph must name the minted run dir's record`);
    assert.ok(para.includes('never a `spec-{N}/` subdirectory'), `template ${i + 1} paragraph must exclude spec-{N}/ subdirectories`);
  });
});
