'use strict';
// tests/build-review-finding-deferral-gate-conformance.test.js — #3004: build
// wrote review minors (per-task reviewer / whole-branch review findings)
// into the open-items ledger as `deferred` or `open` with no valid
// Defer-reason: and no fix-now attempt. build/dispatch.md's SDD invocation
// instruction and build/SKILL.md's Common Step 4 must both cite
// _shared/deferral-gate.md at the review-finding ledger-write instruction,
// and state that severity alone is never a reason.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DISPATCH_MD = path.join(__dirname, '..', 'plugin', 'skills', 'build', 'dispatch.md');
const BUILD_SKILL = path.join(__dirname, '..', 'plugin', 'skills', 'build', 'SKILL.md');

const read = (p) => fs.readFileSync(p, 'utf8');

test('build/dispatch.md cites _shared/deferral-gate.md at the review-finding ledger-write instruction', () => {
  const text = read(DISPATCH_MD);
  assert.match(text, /Review-finding deferral gate \(#3004\)/);
  assert.match(text, /_shared\/deferral-gate\.md`'s fix-now check/);
  assert.match(text, /exactly one `Defer-reason:`/);
});

test('build/dispatch.md states severity alone is never a reason', () => {
  const text = read(DISPATCH_MD);
  assert.match(text, /Severity alone \("minor", "fine to defer"\) is never a reason/);
});

test('build/SKILL.md Common Step 4 cites _shared/deferral-gate.md for review-finding ledger writes', () => {
  const text = read(BUILD_SKILL);
  assert.match(text, /Review-finding ledger writes \(#3004\)/);
  assert.match(text, /_shared\/deferral-gate\.md`'s fix-now check/);
});

test('build/SKILL.md Common Step 4 requires a structured Defer-reason on a genuinely blocked row too', () => {
  const text = read(BUILD_SKILL);
  const step4Index = text.indexOf('### Common Step 4: Handle Blocked Work');
  assert.ok(step4Index !== -1);
  const step4Body = text.slice(step4Index, step4Index + 2000);
  assert.match(step4Body, /Defer-reason: blocked-dependency` or `blocked-external`/);
});

test('go-red proof: a dispatch.md copy missing the review-finding gate citation fails the same assertion', () => {
  const text = read(DISPATCH_MD);
  const without = text.replace(/\*\*Review-finding deferral gate \(#3004\)\.\*\*[^\n]*\n\n/, '');
  assert.throws(() => assert.match(without, /Review-finding deferral gate \(#3004\)/));
});
