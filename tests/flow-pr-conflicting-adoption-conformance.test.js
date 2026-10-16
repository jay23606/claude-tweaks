'use strict';
// tests/flow-pr-conflicting-adoption-conformance.test.js — #3014: a resumed
// pipeline run (a two-call dispatch handoff adopting an inherited run
// directory) never read the PR's mergeable state, so a PR that turned
// CONFLICTING between calls went unnoticed — GitHub runs no pull_request CI
// on a conflicting PR, so the checks list read as merely pending, not
// broken.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const STEPS_AND_GATES = path.join(__dirname, '..', 'plugin', 'skills', 'flow', 'steps-and-gates.md');
const read = (p) => fs.readFileSync(p, 'utf8');

test('steps-and-gates.md adoption path prints a visible CONFLICTING line and logs an AUTO decision', () => {
  const text = read(STEPS_AND_GATES);
  assert.match(text, /CONFLICTING-PR check \(#3014\)/);
  assert.match(text, /mergeable === 'CONFLICTING'/);
  assert.match(text, /is CONFLICTING with \{integration branch\}/);
  assert.match(text, /log-decision\.js --status AUTO/);
});

test('steps-and-gates.md routes the CONFLICTING case to the existing catch-up procedure, cited not restated', () => {
  const text = read(STEPS_AND_GATES);
  const sectionIndex = text.indexOf('CONFLICTING-PR check (#3014)');
  assert.ok(sectionIndex !== -1);
  const section = text.slice(sectionIndex, sectionIndex + 1200);
  assert.match(section, /_shared\/worktree-setup\.md`'s "Post-creation catch-up"/);
  assert.match(section, /_shared\/worktree-catchup-no-run-dir\.md/);
});

test('steps-and-gates.md stops as a HARD-GATE when the catch-up merge itself conflicts', () => {
  const text = read(STEPS_AND_GATES);
  const sectionIndex = text.indexOf('CONFLICTING-PR check (#3014)');
  const section = text.slice(sectionIndex, sectionIndex + 1200);
  assert.match(section, /HARD-GATE failure naming the conflicting paths/);
});

test('steps-and-gates.md states UNKNOWN/MERGEABLE/no-pr all change nothing', () => {
  const text = read(STEPS_AND_GATES);
  const sectionIndex = text.indexOf('CONFLICTING-PR check (#3014)');
  const section = text.slice(sectionIndex, sectionIndex + 1200);
  assert.match(section, /mergeable: 'UNKNOWN'.*changes nothing here/s);
});

test('go-red proof: a copy missing the CONFLICTING-PR check section fails the presence assertion', () => {
  const text = read(STEPS_AND_GATES);
  const without = text.replace(/\n\n\*\*CONFLICTING-PR check \(#3014\)\.\*\*[^\n]*(\n[^\n#][^\n]*)*/, '');
  assert.throws(() => assert.match(without, /CONFLICTING-PR check \(#3014\)/));
});
